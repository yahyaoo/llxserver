/** 歌曲操作回归：规则解除、实时计数、直接喜欢和并发切换。 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
require('tsx/cjs')
const { removeMatchedDislikes } = require('../server/music/service/dislike/removeMatched.ts')
const { parseDislikeRules, isDisliked } = require('../server/music/service/dislike/match.ts')
const song = { id: 'wy_1', songmid: '1', source: 'wy', name: '自由的你', singer: 'G.E.M.邓紫棋', albumName: '自由的你' }

test('取消歌曲解除同时命中的歌手、专辑和歌曲规则，保留无关条目', () => {
  const next = removeMatchedDislikes(song, '自由的你@g.e.m.邓紫棋\n@g.e.m.邓紫棋\n!自由的你@g.e.m.邓紫棋\n@其他歌手',
    [{ id: 1, name: song.singer }, { id: 2, name: '其他歌手' }],
    [{ name: song.albumName, artistName: song.singer }, { name: '其他专辑', artistName: song.singer }], {})
  assert.equal(next.rules, '@其他歌手')
  assert.deepEqual(next.artists.map(item => item.id), [2])
  assert.deepEqual(next.albums.map(item => item.name), ['其他专辑'])
  assert.equal(isDisliked(song, parseDislikeRules(next.rules)), false)
})
test('解除合唱与 Live 规则；未实际命中的规则保持不变', () => {
  const duet = { ...song, name: '自由的你 (Live)', singer: song.singer + '、合唱者' }
  const rules = '自由的你@g.e.m.邓紫棋、合唱者\n@g.e.m.邓紫棋\n@合唱者\n!自由的你@g.e.m.邓紫棋\n!自由的你@合唱者'
  assert.equal(removeMatchedDislikes(duet, rules, [], [], { duetMode: 'all' }).rules, '')
  assert.equal(removeMatchedDislikes(duet, '@g.e.m.邓紫棋', [], [], { duetMode: 'all' }).rules, '@g.e.m.邓紫棋')
  assert.equal(removeMatchedDislikes(duet, '自由的你@g.e.m.邓紫棋', [], [], { normalizeName: false }).rules, '自由的你@g.e.m.邓紫棋')
})
test('歌手名称含规则分隔符时使用相同归一化', () => {
  const next = removeMatchedDislikes({ ...song, singer: 'A@B' }, '', [{ name: 'A@B' }, { name: '其他歌手' }], [], {})
  assert.deepEqual(next.artists.map(item => item.name), ['其他歌手'])
})
function managerFixture() {
  let rules = '', delay, failed = false
  const calls = [], window = {}
  const context = vm.createContext({ window, console, fetch: async (url, options) => {
    calls.push(url)
    if (delay) await delay
    if (failed) return { ok: false, status: 500 }
    if (options.method === 'POST') rules = url.endsWith('/add') ? `${song.name}@${song.singer}` : ''
    const parsed = parseDislikeRules(rules)
    return { ok: true, status: 200, json: async () => ({ success: true, data: { exact: [...parsed.exact], singerNames: [...parsed.singerNames], musicNames: [...parsed.musicNames], albums: [], dislikeList: [] } }) }
  } })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/dislike_manager.js'), 'utf8'), context)
  return { api: window.DislikeManager, calls, delay: value => { delay = value }, fail: () => { failed = true } }
}
test('首次加载中的点击等待加载完成，连续切换按实际状态增删', async () => {
  const f = managerFixture()
  let release
  f.delay(new Promise(resolve => { release = resolve }))
  const loading = f.api.load(), first = f.api.toggleSong(song), second = f.api.toggleSong(song)
  release(); await loading
  assert.equal(await first, true)
  assert.equal(await second, false)
  assert.deepEqual(f.calls, ['/api/music/dislike', '/api/music/dislike/add', '/api/music/dislike/remove'])
  assert.equal(f.api.isDisliked(song), false)
})
test('请求失败时保留状态，初始加载失败时不会提交', async () => {
  const f = managerFixture(); await f.api.load()
  f.api.state.singerNames.add('g.e.m.邓紫棋'); f.fail()
  await assert.rejects(f.api.toggleSong(song), /HTTP 500/)
  assert.equal(f.api.isDisliked(song), true)
  const unavailable = managerFixture(); unavailable.fail()
  await assert.rejects(unavailable.api.toggleSong(song), /无法加载/)
  assert.equal(unavailable.calls.length, 1)
})
test('已初始化时，点击也等待正在进行的强制刷新', async () => {
  const f = managerFixture(); await f.api.load()
  let release
  f.delay(new Promise(resolve => { release = resolve }))
  const refresh = f.api.load(true), toggle = f.api.toggleSong(song)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.calls.length, 2)
  release(); await refresh
  assert.equal(await toggle, true)
})
test('前端专辑匹配遵守精确歌手与合唱设置', () => {
  const f = managerFixture()
  f.api.state.albums = [{ albumName: song.albumName, singers: ['g.e.m.邓紫棋'] }]
  assert.equal(f.api.isDisliked(song), true)
  assert.equal(f.api.isDisliked({ ...song, albumName: undefined, album: { name: song.albumName } }), true)
  assert.equal(f.api.isDisliked({ ...song, singer: 'G.E.M.邓紫棋翻唱' }), false)
  f.api.state.duetMode = 'all'
  assert.equal(f.api.isDisliked({ ...song, singer: song.singer + '、合唱者' }), false)
})
function loveFixture() {
  const personal = { username: 'alice', defaultList: [], loveList: [], userList: [] }, publicData = { ...personal, username: '_open', loveList: [] }
  const writes = [], errors = []; let fail = false
  const window = { myPersonalListData: personal, ListStore: { set: async () => {} }, SyncManager: { mode: 'local' } }
  const context = vm.createContext({ window, document: { querySelectorAll: () => [] }, currentListData: publicData, currentPlayingSong: null,
    isUserLoggedIn: () => true, cleanSongData: value => ({ ...value, id: 'wy_' + value.songmid }),
    ensurePlaylistDataAvailable: async () => personal, getUserAuthHeaders: () => ({ 'x-user-token': 'alice' }),
    addMusicByConfiguredLocation: (list, value) => list.push(value), renderMyLists() {}, showSuccess() {}, showError: value => errors.push(value),
    fetch: async (url, options) => { writes.push({ url, ...options }); return { ok: !fail, text: async () => '保存失败' } },
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/song_actions.js'), 'utf8'), context)
  return { api: window.SongActions, personal, publicData, writes, errors, fail: () => { fail = true } }
}
test('喜欢直接保存个人列表、不重复，第二次点击取消', async () => {
  const f = loveFixture(); await f.api.toggleLove(song)
  assert.equal(f.personal.loveList.length, 1)
  assert.equal(f.publicData.loveList.length, 0)
  assert.equal(f.writes[0].url, '/api/user/list')
  assert.equal(JSON.parse(f.writes[0].body).loveList[0].id, 'wy_1')
  assert.equal(f.api.isLoved(song), true)
  await f.api.toggleLove(song)
  assert.equal(f.personal.loveList.length, 0)
  await Promise.all([f.api.toggleLove(song), f.api.toggleLove(song)])
  assert.equal(f.personal.loveList.length, 0)
})
test('喜欢保存失败保持原列表，特殊字符不会破坏按钮属性', async () => {
  const f = loveFixture(); f.fail(); await f.api.toggleLove(song)
  assert.equal(f.personal.loveList.length, 0); assert.equal(f.errors.length, 1)
  const odd = { ...song, name: `引号'\"<>&歌曲` }, html = f.api.renderLoveButton(odd)
  assert.equal(JSON.parse(decodeURIComponent(html.match(/data-love-song="([^"]+)"/)[1])).name, odd.name)
})
test('歌手与专辑保存立即刷新统计', async () => {
  const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const nodes = new Map(['dislike-song-count', 'dislike-artist-count', 'dislike-album-count'].map(id => [id, {}]))
  let reloads = 0
  const window = { dislikeLibraryData: { artists: [{ name: song.singer }], albums: [{ name: song.albumName }] }, DislikeManager: { state: { dislikeList: [] }, load: async () => {} } }
  const context = vm.createContext({ window, document: { getElementById: id => nodes.get(id) || { classList: { contains: () => true } } }, console, isUserLoggedIn: () => true, getUserAuthHeaders: () => ({}), fetch: async () => ({ ok: true }), loadLibraryData: async () => { reloads++ } })
  vm.runInContext(app.slice(app.indexOf('function refreshDislikeSidebarCount()'), app.indexOf('/** 持久化 artists')), context)
  vm.runInContext(app.slice(app.indexOf('async function saveDislikeLibraryArtists('), app.indexOf('/** 检查歌手是否已拉黑')), context)
  await context.saveDislikeLibraryArtists()
  assert.equal(nodes.get('dislike-artist-count').textContent, 1)
  await context.saveDislikeLibraryAlbums()
  assert.equal(nodes.get('dislike-album-count').textContent, 1)
  assert.equal(reloads, 2)
})
