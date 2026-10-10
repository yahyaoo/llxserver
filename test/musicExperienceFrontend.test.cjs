/** 验证账号切换、认证 URL 与异步保存顺序。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

test('顶部滚动入口：列表映射到页面，弹窗保持独立，设置随屏宽切换', () => {
  let mobile = false
  const nodes = new Map()
  const document = { getElementById: id => id === 'music-top-bar' ? null : nodes.get(id) }
  const window = { matchMedia: () => ({ matches: mobile }) }
  const context = vm.createContext({ document, window })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/components/top-bar/index.js'), 'utf8'), context)
  for (const [list, page] of [['search-results', 'view-search'], ['artist-detail-content', 'view-search'], ['songlist-grid', 'view-songlist'], ['sl-detail-list', 'songlist-detail-view'], ['lm-list-container', 'view-localmusic'], ['lb-songs-container', 'view-leaderboard'], ['lb-songs-list', 'view-leaderboard']]) {
    const node = {}; nodes.set(page, node)
    assert.equal(window.getMusicScrollContainer(list), node)
  }
  nodes.set('manual-index-results', {})
  assert.equal(window.getMusicScrollContainer('manual-index-results'), nodes.get('manual-index-results'))
  nodes.set('settings-content', {}); nodes.set('settings-shell', {})
  assert.equal(window.getMusicScrollContainer('settings-content'), nodes.get('settings-content'))
  mobile = true
  assert.equal(window.getMusicScrollContainer('settings-content'), nodes.get('settings-shell'))
})

function fixture() {
  let auth = { 'x-user-name': 'alice', 'x-user-token': 'first' }
  const calls = [], styles = new Map(), storage = new Map(), listeners = new Map()
  const root = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) }, classList: { toggle() {}, add() {} } }
  const window = { getUserAuthHeaders: () => auth, ThemeControls: { colors: [] }, dispatchEvent() {}, showError: error => { throw new Error(error) }, addEventListener() {} }
  const document = { documentElement: root, querySelectorAll: () => [], getElementById: id => id === 'view-recent' ? { classList: { contains: () => true } } : null, addEventListener: (key, fn) => listeners.set(key, fn) }
  const fetch = async (url, options) => {
    calls.push({ url, ...options })
    return { ok: true, json: async () => url.includes('appearance') ? { theme: 'custom', appearance: 'light', color: '#234567', opacity: .4, glassBlur: 50, recentLimit: 1, background: null } : { items: [] } }
  }
  const context = vm.createContext({ window, document, fetch, URL, URLSearchParams, location: { origin: 'http://localhost' }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, setTheme() {}, setAppearance() {}, Event: class {} })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/music_experience.js'), 'utf8'), context)
  return { api: window.MusicExperience, calls, styles, auth: value => { auth = value } }
}

test('本地播放保留歌词定位、当前账号认证和无封面占位', () => {
  const { api } = fixture()
  const song = api.playable({ filename: '中文.wav', folder: 'cache', name: '歌曲', hasCover: false })
  assert.equal(song._localFilename, '中文.wav')
  assert.equal(song._localUsername, 'alice')
  assert.equal(song._localFolder, 'cache')
  assert.equal(new URL(song.url, 'http://localhost').searchParams.get('token'), 'first')
  assert.equal(song.pic, '/music/assets/logo.svg')
})

test('未关联本地歌曲走原内嵌歌词流程，关联歌曲保留真实平台身份', async () => {
  const { api } = fixture()
  const song = api.playable({ filename: '中文.wav', folder: 'custom', source: 'local', songmid: 'local_placeholder', meta: { songmid: 'local_placeholder' }, name: '歌曲' })
  assert.equal(song._isCustomDir, true)
  const calls = []
  const context = vm.createContext({ console: { log() {}, warn() {} }, fetchEmbedLyricForLocalSong: async value => { calls.push(value._localFilename) }, fetch: () => assert.fail('未关联本地文件不能请求在线歌词') })
  const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  vm.runInContext(app.slice(app.indexOf('async function fetchLyric('), app.indexOf('function applyLyricUpdate(')), context)
  await context.fetchLyric(song)
  assert.deepEqual(calls, ['中文.wav'])
  const linked = api.playable({ filename: '关联.wav', songInfo: { source: 'wy', songmid: '123', id: 'wy_123' }, name: '已关联歌曲' })
  assert.equal(linked.source, 'wy')
  assert.equal(linked.songmid, '123')
})

test('同账号 Token 更新重新加载，切换账号不会复用上一账号缓存', async () => {
  const f = fixture()
  await f.api.accountChanged()
  await f.api.accountChanged()
  assert.equal(f.calls.length, 1)
  f.auth({ 'x-user-name': 'alice', 'x-user-token': 'second' })
  await f.api.accountChanged()
  assert.equal(f.calls.length, 2)
  f.auth({ 'x-user-name': 'bob', 'x-user-token': 'bob-token' })
  await f.api.accountChanged()
  assert.equal(f.api.account, 'bob')
  assert.equal(f.calls.at(-1).headers['x-user-name'], 'bob')
})

test('保存应用服务端归一值，最近写入按调用顺序且保留发起账号', async () => {
  const f = fixture()
  await f.api.accountChanged()
  await f.api.change({ recentLimit: 0 })
  assert.equal(f.api.value.recentLimit, 1)
  f.api.record({ id: 'a', source: 'wy', name: '甲' }, '128k')
  f.auth({ 'x-user-name': 'bob', 'x-user-token': 'bob-token' })
  f.api.record({ id: 'b', source: 'wy', name: '乙' }, '128k')
  await new Promise(resolve => setImmediate(resolve))
  const writes = f.calls.filter(call => call.url.endsWith('/recent'))
  assert.deepEqual(writes.map(call => JSON.parse(call.body).id), ['a', 'b'])
  assert.deepEqual(writes.map(call => call.headers['x-user-name']), ['alice', 'bob'])
})

test('透明度只反转背景混合比例，毛玻璃强度独立并允许完全关闭', async () => {
  const f = fixture()
  await f.api.accountChanged()
  assert.equal(f.styles.get('--surface-opacity'), .6)
  assert.equal(f.styles.get('--surface-blur'), '20px')
  const full = f.api.change({ opacity: 1, glassBlur: 0 })
  assert.equal(f.styles.get('--surface-opacity'), 0)
  assert.equal(f.styles.get('--surface-blur'), '0px')
  await full
  const solid = f.api.change({ opacity: 0, glassBlur: 100 })
  assert.equal(f.styles.get('--surface-opacity'), 1)
  assert.equal(f.styles.get('--surface-blur'), '40px')
  await solid
  const writes = f.calls.filter(call => call.method === 'PUT').map(call => JSON.parse(call.body))
  assert.deepEqual(writes.map(value => [value.opacity, value.glassBlur]), [[1, 0], [0, 100]])
})
