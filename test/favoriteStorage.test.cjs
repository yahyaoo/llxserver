/** 独立喜爱迁移、写入保护和认证回归。 @author jingyh */
require('tsx/cjs')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { repositories, closeStorage } = require('../server/application/persistence/storage')
const { FavoriteRepository } = require('../server/music/repository/FavoriteRepository')
const { ListDataManage } = require('../server/music/service/playlist/listDataManage')
const { handleFavorites } = require('../server/music/service/FavoriteService')
const { postUserList, postMusicUserListAdd } = require('../server/music/service/PlaylistService')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-favorites-unit-'))
global.lx = { dataPath: root, config: { 'frontend.password': 'test-admin', 'user.enablePublicFavorites': true, 'user.enablePublicNonAdminAccess': true } }
after(() => { closeStorage(root); fs.rmSync(root, { recursive: true, force: true }) })
const song = { id: 'wy_1', name: '测试歌曲', singer: '测试歌手', source: 'wy', meta: { size: 1024, bitDepth: 24, sampleRate: 96000 } }
const legacy = () => ({ defaultList: [], loveList: [song], userList: [{ id: 'custom', name: '歌单', list: [] }] })
function dataManager(user, data = legacy()) {
  return new ListDataManage({ userDataManage: { userDir: path.join(root, 'users', user) }, getSnapshotInfo: async () => ({ latest: 'legacy' }), getSnapshot: async () => structuredClone(data) })
}

test('旧喜爱自动迁移到独立表，账号隔离；清空重启后不从旧快照复活', async () => {
  const alice = dataManager('alice'); await alice.initPromise
  assert.deepEqual((await alice.getListData()).loveList, [song])
  const repo = new FavoriteRepository(repositories().music, path.join(root, 'users/alice'))
  assert.deepEqual(repo.initialize([]), [song])
  const bob = dataManager('bob', { defaultList: [], loveList: [], userList: [] }); await bob.initPromise
  assert.equal((await bob.getListData()).loveList.length, 0)
  await alice.listMusicRemove('love', [song.id]); alice.persistFavorites()
  closeStorage(root)
  const restarted = dataManager('alice'); await restarted.initPromise
  assert.deepEqual((await restarted.getListData()).loveList, [])
})

test('普通歌单保存保留最新喜爱，显式历史恢复仍可以恢复喜爱', async () => {
  const data = dataManager('restore'); await data.initPromise
  await data.restore({ ...legacy(), loveList: [], defaultList: [song] }, true)
  assert.deepEqual((await data.getListData()).loveList, [song])
  assert.equal((await data.getListData()).defaultList.length, 1)
  await data.restore({ ...legacy(), loveList: [] })
  assert.equal((await data.getListData()).loveList.length, 0)
  const restarted = dataManager('restore'); await restarted.initPromise
  assert.equal((await restarted.getListData()).loveList.length, 0)
})

function fixture(user = 'endpoint') {
  const data = dataManager(user, { defaultList: [], loveList: [], userList: [] })
  const manager = { listDataManage: data, getListData: data.getListData, createSnapshot: async () => { await data.initPromise; data.persistFavorites() } }
  const runtime = { verifyUserAuth: req => req.headers['x-user-token'] === 'valid' ? user : null,
    getUserSpace: name => { assert.ok([user, '_open'].includes(name)); return { listManage: manager } },
    readBody: async req => req.body, getUserConfig: () => ({ 'list.addMusicLocationType': 'bottom' }) }
  const request = async (handler, input, headers = { 'x-user-token': 'valid' }, query = '') => {
    let finish, status = 0, text = ''
    const done = new Promise(resolve => { finish = resolve })
    const req = { method: input === undefined ? 'GET' : 'POST', headers, body: typeof input === 'string' ? input : JSON.stringify(input) }
    const context = { req, urlObj: new URL('http://test/api/user/favorites' + query), res: { writeHead(value) { status = value }, end(value) { text = value; finish() } } }
    await handler(context, runtime); await done
    return { status, text, json: () => JSON.parse(text) }
  }
  return { request, data }
}

test('独立接口按配置添加、不重复、取消持久化，并发操作不丢数据', async () => {
  const f = fixture(); const other = { ...song, id: 'wy_2' }
  const added = await Promise.all([f.request(handleFavorites, { song, loved: true }), f.request(handleFavorites, { song: other, loved: true })])
  assert.deepEqual(added.map(value => value.status), [200, 200])
  assert.deepEqual((await f.data.getListData()).loveList.map(value => value.id), ['wy_1', 'wy_2'])
  await f.request(handleFavorites, { song, loved: true })
  assert.equal((await f.data.getListData()).loveList.length, 2)
  await f.request(handleFavorites, { song, loved: false })
  assert.deepEqual((await f.request(handleFavorites)).json().items.map(value => value.id), ['wy_2'])
  const restarted = dataManager('endpoint'); await restarted.initPromise
  assert.deepEqual((await restarted.getListData()).loveList.map(value => value.id), ['wy_2'])
})

test('拒绝伪造账号、公共非管理员写入、畸形请求与普通歌单的 love 目标', async () => {
  const f = fixture('security')
  assert.equal((await f.request(handleFavorites, { song, loved: true }, { 'x-user-name': 'security' })).status, 401)
  assert.equal((await f.request(handleFavorites, { song, loved: true }, { 'x-user-token': 'valid', 'x-user-name': 'other' })).status, 401)
  assert.equal((await f.request(handleFavorites, { song, loved: true }, {}, '?user=_open')).status, 403)
  assert.equal((await f.request(handleFavorites, { song, loved: true }, { 'x-frontend-auth': 'test-admin' }, '?user=_open')).status, 200)
  assert.equal((await f.request(handleFavorites, { song, loved: 'true' })).status, 400)
  assert.equal((await f.request(handleFavorites, '{bad')).status, 400)
  assert.equal((await f.request(postMusicUserListAdd, { listId: 'love', musicInfos: [song] })).status, 400)
  assert.equal((await f.request(postUserList, { defaultList: [], userList: [{ id: 'love', list: [] }] })).status, 400)
})

test('普通歌单接口无法清空喜爱，仍可保存自定义歌单', async () => {
  const f = fixture('playlist')
  await f.request(handleFavorites, { song, loved: true })
  assert.equal((await f.request(postUserList, { ...legacy(), loveList: [] })).status, 200)
  assert.deepEqual((await f.data.getListData()).loveList, [song])
  assert.equal((await f.data.getListData()).userList[0].id, 'custom')
})
