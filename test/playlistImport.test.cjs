/** 歌单追加导入的格式、事务与界面单元测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
require('tsx/cjs')
const { parsePlaylistImport } = require('../server/music/service/configuration/PlaylistImportParser.ts')
const { LxConfigurationImportService } = require('../server/music/service/configuration/LxConfigurationImportService.ts')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const song = { id: 'wy_1', name: '中文歌曲', source: 'wy', meta: { songId: '1', unknown: '保留' } }
const playlist = { id: 'existing', name: '中文歌单', source: 'wy', sourceListId: '123', list: [song, song], extra: '扩展' }

test('复用洛雪 v2 解析并支持本站单歌单及服务器备份，保留顺序和扩展字段', () => {
  assert.deepEqual(parsePlaylistImport({ type: 'lxserver-playlist', version: 1, playlist }), [playlist])
  assert.deepEqual(parsePlaylistImport({ type: 'playList_v2', data: [{ id: 'default', name: '默认列表', list: [song] }, playlist] }), [{ id: 'default', name: '默认列表', list: [song] }, playlist])
  assert.deepEqual(parsePlaylistImport({ defaultList: [song], loveList: [], userList: [playlist] }), [{ id: 'default', name: '默认列表', list: [song] }, playlist])
})

test('整体拒绝损坏歌曲、重复标识、未知版本、空文件及设置配置', () => {
  for (const value of [null, {}, [], { settings: { volume: 1 } }, { type: 'playList_v2', data: [] },
    { type: 'playList_v2', data: [playlist, playlist] }, { type: 'playList_v2', data: [{ id: 'default', list: 'bad' }] },
    { type: 'lxserver-playlist', version: 2, playlist }, { type: 'lxserver-playlist', version: 1, playlist: { ...playlist, list: [{}] } }]) {
    assert.throws(() => parsePlaylistImport(value))
  }
})

function spaceFixture() {
  let lists = { defaultList: [song], loveList: [], userList: [playlist] }
  const snapshotInfo = { latest: 'old', time: 1, list: [], clients: { c: { snapshotKey: 'old' } } }
  const space = { dataManage: { userDir: 'D:/test' }, listManage: {
    getListData: async () => lists,
    listDataManage: { initPromise: Promise.resolve(), restore: async value => { lists = value } },
    snapshotDataManage: { snapshotDir: 'D:/test/list/snapshot', snapshotInfoFilePath: 'D:/test/list/snapshotInfo.json', snapshotInfo, getSnapshotInfo: async () => space.listManage.snapshotDataManage.snapshotInfo }
  } }
  return { space, get: () => lists }
}

test('追加导入重建 ID，不覆盖现有列表；并发导入不丢失歌单', async () => {
  const fixture = spaceFixture()
  let writes = 0
  const service = new LxConfigurationImportService({ replace() { writes++ } })
  const results = await Promise.all([service.importPlaylists(fixture.space, [playlist]), service.importPlaylists(fixture.space, [playlist])])
  assert.equal(writes, 2)
  assert.equal(fixture.get().userList.length, 3)
  assert.deepEqual(fixture.get().defaultList, [song])
  assert.deepEqual(fixture.get().userList[0], playlist)
  assert.equal(new Set(fixture.get().userList.map(item => item.id)).size, 3)
  assert.deepEqual(fixture.get().userList[1].list, [song, song])
  assert.equal(fixture.get().userList[1].extra, '扩展')
  assert.equal(results[0].playlists, 1)
  assert.equal(results[0].songs, 2)
  assert.deepEqual(fixture.space.listManage.snapshotDataManage.snapshotInfo.clients, {})
})

test('写库失败保留原列表和同步游标，后续重试可成功', async () => {
  const fixture = spaceFixture(), original = fixture.get()
  const service = new LxConfigurationImportService({ replace() { throw new Error('SQL 失败') } })
  await assert.rejects(service.importPlaylists(fixture.space, [playlist]), /SQL 失败/)
  assert.equal(fixture.get(), original)
  assert.equal(fixture.space.listManage.snapshotDataManage.snapshotInfo.latest, 'old')
  const retry = new LxConfigurationImportService({ replace() {} })
  await retry.importPlaylists(fixture.space, [playlist])
  assert.equal(fixture.get().userList.length, 2)
})

test('前端上传失败不更新缓存，成功才刷新列表；可重选同一文件', async () => {
  let applied = 0, uploaded = 0, status = 400
  const button = { disabled: false }, input = { files: [{ size: 10 }], value: 'file' }
  const window = { getPlaylistImportTarget: () => 'alice', fetchDownloadWithAuth: async (url, options) => {
    assert.equal(url, '/api/music/playlists/import?user=alice'); assert.equal(options.method, 'POST'); uploaded++
    return { ok: status === 200, text: async () => JSON.stringify(status === 200 ? { success: true, username: 'alice', playlists: 1, songs: 2, lists: {} } : { success: false, message: '无效文件' }) }
  }, applyImportedPlaylists: async () => { applied++ }, showError() {}, showSuccess() {}, addEventListener() {} }
  const document = { getElementById: id => id === 'playlist-actions-button' ? button : null, addEventListener() {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/views/main-navigation/PlaylistActions.js'), 'utf8'), { window, document, FormData: class { append() {} }, URLSearchParams })
  await window.importPlaylistFile(input)
  assert.equal(applied, 0); assert.equal(input.value, ''); assert.equal(button.disabled, false)
  status = 200; await window.importPlaylistFile(input)
  assert.equal(applied, 1); assert.equal(uploaded, 2)
  input.files = [{ size: 21 * 1024 * 1024 }]; await window.importPlaylistFile(input)
  assert.equal(uploaded, 2)
})
