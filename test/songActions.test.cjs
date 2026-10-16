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
  const writes = [], errors = []; let fail = false, delay = null
  const window = { myPersonalListData: personal, ListStore: { set: async () => {} }, SyncManager: { mode: 'local' } }
  const context = vm.createContext({ window, document: { querySelectorAll: () => [] }, currentListData: publicData, currentPlayingSong: null,
    isUserLoggedIn: () => true, cleanSongData: value => ({ ...value, id: 'wy_' + value.songmid }),
    ensurePlaylistDataAvailable: async () => personal, getUserAuthHeaders: () => ({ 'x-user-token': 'alice' }),
    addMusicByConfiguredLocation: (list, value) => list.push(value), renderMyLists() {}, showSuccess() {}, showError: value => errors.push(value),
    fetch: async (url, options) => {
      if (delay) await delay
      writes.push({ url, ...options }); const input = JSON.parse(options.body)
      const items = input.loved ? personal.loveList : personal.loveList.filter(item => item.id !== input.song.id)
      return { ok: !fail, text: async () => '保存失败', json: async () => ({ success: true, items }) }
    },
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/song_actions.js'), 'utf8'), context)
  return { api: window.SongActions, context, personal, publicData, writes, errors, fail: () => { fail = true }, delay: value => { delay = value } }
}
test('喜欢直接保存个人列表、不重复，第二次点击取消', async () => {
  const f = loveFixture(); await f.api.toggleLove(song)
  assert.equal(f.personal.loveList.length, 1)
  assert.equal(f.publicData.loveList.length, 0)
  assert.equal(f.writes[0].url, '/api/user/favorites')
  assert.equal(JSON.parse(f.writes[0].body).song.id, 'wy_1')
  assert.equal(JSON.parse(f.writes[0].body).loved, true)
  assert.equal(f.api.isLoved(song), true)
  await f.api.toggleLove(song)
  assert.equal(f.personal.loveList.length, 0)
  await Promise.all([f.api.toggleLove(song), f.api.toggleLove(song)])
  assert.equal(f.personal.loveList.length, 0)
})
test('点击歌曲喜欢只更新喜欢状态，不因过期的歌单选择状态而导航或重绘列表', async () => {
  const f = loveFixture(); let navigations = 0, listRenders = 0
  f.context.currentListData = f.personal
  f.context.window.currentViewingListId = 'love'
  f.context.handleListClick = () => { navigations++ }
  f.context.renderMyLists = () => { listRenders++ }
  await f.api.toggleLove(song)
  assert.equal(f.api.isLoved(song), true)
  assert.equal(navigations, 0, '喜欢操作不得把当前页面切到歌单')
  assert.equal(listRenders, 0, '喜欢操作只更新爱心状态，不重新渲染页面列表')
})
test('喜欢保存尚未完成时立即点亮爱心，不重绘列表', async () => {
  const f = loveFixture(); let release, listRenders = 0
  f.context.renderMyLists = () => { listRenders++ }
  f.delay(new Promise(resolve => { release = resolve }))
  const saving = f.api.toggleLove(song)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.api.isLoved(song), true)
  assert.equal(listRenders, 0)
  release(); await saving
  assert.equal(f.api.isLoved(song), true)
})
test('喜欢保存失败保持原列表，特殊字符不会破坏按钮属性', async () => {
  const f = loveFixture(); f.fail(); await f.api.toggleLove(song)
  assert.equal(f.personal.loveList.length, 0); assert.equal(f.errors.length, 1)
  const odd = { ...song, name: `引号'\"<>&歌曲` }, html = f.api.renderLoveButton(odd)
  assert.equal(JSON.parse(decodeURIComponent(html.match(/data-love-song="([^"]+)"/)[1])).name, odd.name)
})

test('播放队列图标安全携带歌曲数据，加入操作追加队列且不打断当前歌曲', () => {
  const f = loveFixture(), odd = { ...song, name: `引号'"<>&歌曲` }
  const html = f.api.renderQueueButton(odd)
  assert.equal(JSON.parse(decodeURIComponent(html.match(/data-queue-song="([^"]+)"/)[1])).name, odd.name)
  assert.match(html, /加入播放列表/)

  const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const helper = app.match(/function addSongToPlaybackQueue\(song\) \{[\s\S]*?\n\}/)
  assert.ok(helper, '歌曲行需要可复用的播放队列追加入口')
  const existing = { id: 'current' }, queue = [existing]
  let saved = 0, rendered = 0, played = 0
  const context = vm.createContext({ window: { MusicExperience: { playable: value => ({ ...value, playable: true }) } }, currentPlaylist: queue,
    document: { getElementById: () => ({ classList: { contains: () => true } }) }, invalidateRoamingPreselection() {},
    renderQueue() { rendered++ }, savePlaybackState() { saved++ }, showSuccess() {}, playSong() { played++ } })
  vm.runInContext(helper[0] + '\nwindow.addSongToPlaybackQueue = addSongToPlaybackQueue;', context)
  context.window.addSongToPlaybackQueue(song)
  assert.deepEqual(queue.map(item => item.id), ['current', song.id])
  assert.equal(queue[1].playable, true)
  assert.equal(saved, 1); assert.equal(rendered, 0); assert.equal(played, 0)
})

function playlistToggleFixture(fail = false) {
  const targetList = [], personal = { username: 'alice', userList: [{ id: 'favorites', list: targetList }] }
  const events = [], errors = [], successes = []
  const context = vm.createContext({ window: { myPersonalListData: personal }, currentListData: personal,
    currentPlayingSong: song, isUserLoggedIn: () => true, cleanSongData: value => ({ ...value }),
    addMusicByConfiguredLocation: (list, value) => list.push(value), updateGridItemVisuals() {},
    closePlaylistAddModal() { events.push('closed') }, pushDataChange: async () => {
      events.push('sync-started'); if (fail) throw new Error('接口异常')
    }, renderMyLists() {}, showSuccess: value => successes.push(value), showError: value => errors.push(value), showInfo() {} })
  const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const helper = source.match(/async function handleTogglePlaylist\(listId, btnElement\) \{[\s\S]*?\n\}/)
  assert.ok(helper, '歌单选择需要具备明确的关闭与同步结果处理')
  vm.runInContext(helper[0], context)
  context.window.batchCollectSongs = null
  context.window.playlistAddTargetSong = song
  return { context, events, errors, successes, targetList, invoke: () => context.handleTogglePlaylist('favorites', {}) }
}

test('点击歌单立即关闭弹框，同步成功后提示加入成功', async () => {
  const f = playlistToggleFixture()
  await f.invoke()
  assert.deepEqual(f.events, ['closed', 'sync-started'])
  assert.equal(f.targetList[0].id, song.id)
  assert.deepEqual(f.successes, ['已加入歌单'])
  assert.deepEqual(f.errors, [])
})

test('加入歌单同步失败时弹框已关闭、列表回滚并提示失败', async () => {
  const f = playlistToggleFixture(true)
  await f.invoke()
  assert.deepEqual(f.events, ['closed', 'sync-started'])
  assert.deepEqual(f.targetList, [])
  assert.deepEqual(f.successes, [])
  assert.match(f.errors[0], /加入歌单失败：接口异常/)
})

/** 播放控件复用已验证的喜欢操作，不进入歌单选择弹框。 @author jingyh */
function playerLoveFixture() {
  const f = loveFixture(), attributes = {}, classes = new Set(), iconClasses = new Set(['fas'])
  const button = { setAttribute: (key, value) => { attributes[key] = value },
    classList: { add: key => classes.add(key), remove: key => classes.delete(key) },
    querySelector: () => ({ classList: { add: key => iconClasses.add(key), remove: key => iconClasses.delete(key) } }) }
  let modalCalls = 0
  const context = vm.createContext({ window: { SongActions: f.api }, document: { getElementById: () => button },
    openPlaylistAddModal: () => { modalCalls++ } })
  const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const helper = source.match(/function updatePlayerLoveButton\(song\) \{[\s\S]*?\n\}/)
  assert.ok(helper, '播放爱心需要独立刷新入口')
  vm.runInContext(helper[0], context)
  const refresh = () => context.updatePlayerLoveButton(song)
  refresh()
  return { ...f, button, attributes, classes, iconClasses, refresh, modalCalls: () => modalCalls }
}

test('播放爱心直接加入我的喜爱，再次点击取消且不打开歌单弹框', async () => {
  const f = playerLoveFixture()
  f.personal.userList.push({ id: 'other', list: [song] }); f.refresh()
  assert.equal(f.attributes['aria-pressed'], 'false', '收藏在其他歌单中不算喜欢')
  assert.equal(f.iconClasses.has('far'), true)
  await f.button.onclick({ stopPropagation() {} }); f.refresh()
  assert.equal(f.personal.loveList[0].id, song.id)
  assert.equal(f.attributes['aria-pressed'], 'true')
  assert.equal(f.button.title, '取消喜欢')
  assert.equal(f.classes.has('text-red-500'), true)
  await f.button.onclick({ stopPropagation() {} }); f.refresh()
  assert.equal(f.personal.loveList.length, 0)
  assert.equal(f.personal.userList[0].list.length, 1)
  assert.equal(f.attributes['aria-pressed'], 'false')
  assert.equal(f.modalCalls(), 0)
})

test('播放爱心保存失败不点亮红心，不打开弹框', async () => {
  const f = playerLoveFixture(); f.fail()
  await f.button.onclick({ stopPropagation() {} }); f.refresh()
  assert.equal(f.personal.loveList.length, 0)
  assert.equal(f.classes.has('text-red-500'), false)
  assert.equal(f.errors.length, 1)
  assert.equal(f.modalCalls(), 0)
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
