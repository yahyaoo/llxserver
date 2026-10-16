/** 真实 HTTP 与前端模块联动验证歌曲操作，使用隔离账号和 SQLite。 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { startLeaderboardRuntime } = require('./helpers/leaderboardRuntime.cjs')

test('真实接口：歌手统计、解除全部命中规则、重复切换、直接喜欢持久化', { timeout: 60000 }, async () => {
  const runtime = await startLeaderboardRuntime()
  try {
    const request = async (url, body) => {
      const response = await fetch(runtime.origin + url, { method: body ? 'POST' : 'GET', headers: { ...runtime.headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      assert.equal(response.status, 200, `${url}: ${await response.clone().text()}`)
      return response.json()
    }
    const song = { id: 'wy_1', songmid: '1', source: 'wy', name: '自由的你', singer: 'G.E.M.邓紫棋', albumName: '自由的你', meta: { songId: '1', albumName: '自由的你' } }
    await request('/api/user/dislike/library/artists', [{ id: 'artist-1', source: 'wy', name: song.singer }])
    await request('/api/user/dislike/library/albums', [{ id: 'album-1', source: 'wy', name: song.albumName, artistName: song.singer }])
    await request('/api/music/dislike/add', { ...song, type: 'song' })
    await request('/api/music/dislike/add', { type: 'singer', singer: '其他歌手' })
    const window = {}
    const browserFetch = (url, options = {}) => fetch(runtime.origin + url, { ...options, headers: { ...runtime.headers, ...options.headers } })
    const context = vm.createContext({ window, console, fetch: browserFetch })
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/dislike_manager.js'), 'utf8'), context)
    const manager = window.DislikeManager
    await manager.load()
    assert.equal(manager.isDisliked(song), true)
    assert.equal((await request('/api/user/dislike/library/artists')).length, 1)
    assert.equal(await manager.toggleSong(song), false)
    assert.equal((await request('/api/user/dislike/library/artists')).length, 0)
    assert.equal((await request('/api/user/dislike/library/albums')).length, 0)
    await manager.load(true)
    assert.equal(manager.isDisliked(song), false)
    assert.equal(manager.state.singerNames.has('其他歌手'), true)
    assert.equal(await manager.toggleSong(song), true)
    assert.equal(await manager.toggleSong(song), false)

    const data = await request('/api/user/list')
    const personal = data.data || data
    assert.ok(Array.isArray(personal.loveList))
    window.myPersonalListData = personal
    window.ListStore = { set: async () => {} }
    window.SyncManager = { mode: 'local' }
    Object.assign(context, { document: { querySelectorAll: () => [] }, currentListData: personal, currentPlayingSong: null,
      isUserLoggedIn: () => true, cleanSongData: item => item, ensurePlaylistDataAvailable: async () => personal,
      getUserAuthHeaders: () => runtime.headers, addMusicByConfiguredLocation: (list, item) => list.push(item),
      renderMyLists() {}, showSuccess() {}, showError: message => assert.fail(message) })
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/song_actions.js'), 'utf8'), context)
    await window.SongActions.toggleLove(song)
    assert.equal((await request('/api/user/list')).loveList.some(item => item.id === song.id), true)
    await window.SongActions.toggleLove(song)
    assert.equal((await request('/api/user/list')).loveList.some(item => item.id === song.id), false)
  } finally { await runtime.stop() }
})

test('真实歌单接口：点击歌单立即关闭，歌曲保存后显示成功', { timeout: 30000 }, async () => {
  const runtime = await require('./helpers/accountRuntime.cjs').startAccountRuntime()
  try {
    const login = await fetch(runtime.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'alice123' }) })
    assert.equal(login.status, 200)
    const token = (await login.json()).token
    const headers = { 'Content-Type': 'application/json', 'x-user-token': token }
    const initial = await fetch(runtime.origin + '/api/user/list', { headers })
    assert.equal(initial.status, 200)
    const personal = await initial.json()
    const targetList = personal.userList[0]
    assert.ok(targetList, '测试账号应有可选歌单')
    const song = { id: 'wy_add_modal_test', name: '弹框交互测试歌曲', singer: '测试歌手', source: 'wy', meta: { songId: 'add_modal_test' } }
    let modalClosed = false
    const successes = [], errors = []
    const window = { myPersonalListData: personal, playlistAddTargetSong: song, batchCollectSongs: null }
    const context = vm.createContext({ window, currentListData: personal, currentPlayingSong: song, isUserLoggedIn: () => true,
      cleanSongData: value => ({ ...value }), addMusicByConfiguredLocation: (list, value) => list.push(value),
      updateGridItemVisuals() {}, closePlaylistAddModal() { modalClosed = true }, renderMyLists() {}, showSuccess: value => successes.push(value),
      showError: value => errors.push(value), showInfo() {}, pushDataChange: async list => {
        const response = await fetch(runtime.origin + '/api/user/list', { method: 'POST', headers, body: JSON.stringify(list) })
        assert.equal(response.status, 200, await response.clone().text())
      } })
    const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
    const handler = app.match(/async function handleTogglePlaylist\(listId, btnElement\) \{[\s\S]*?\n\}/)
    assert.ok(handler, '系统测试应执行页面实际使用的歌单点击处理函数')
    vm.runInContext(handler[0], context)
    await context.handleTogglePlaylist(targetList.id, {})

    assert.equal(modalClosed, true)
    assert.deepEqual(successes, ['已加入歌单'])
    assert.deepEqual(errors, [])
    const saved = await fetch(runtime.origin + '/api/user/list', { headers })
    assert.equal(saved.status, 200)
    assert.ok((await saved.json()).userList.find(list => list.id === targetList.id).list.some(item => item.id === song.id))
  } finally { await runtime.stop() }
})
