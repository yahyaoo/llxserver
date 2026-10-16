/** 外观控件保存的前端回归测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { PlaybackTracker, playCount, sortByPlayCount } = require('../client/music/js/play_statistics.js')

test('旧最近记录从当前账号收藏补齐歌词参数，来源不符不混用', () => {
  const window = { getUserAuthHeaders: () => ({}), currentListData: { loveList: [{ id: 'kg_one', source: 'kg', meta: { songmid: 'one', hash: 'restored-hash' } }], userList: [] } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/music_experience.js'), 'utf8'), { window, document: { documentElement: {}, addEventListener() {} }, URL, URLSearchParams, location: { origin: 'http://localhost' } })
  const legacy = { id: 'kg_one', source: 'kg', name: '旧记录' }
  assert.equal(window.MusicExperience.playable(legacy).hash, 'restored-hash')
  assert.equal(window.MusicExperience.playable(legacy).songmid, 'one')
  assert.equal(legacy.hash, undefined)
  assert.equal(window.MusicExperience.playable({ ...legacy, source: 'qq' }).hash, undefined)
})

test('旧本地记录按当前账号重建目录及下载 URL，不复用保存时的令牌', () => {
  const context = vm.createContext({ window: { getUserAuthHeaders: () => ({ 'x-user-name': 'alice', 'x-user-token': 'current-token' }) },
    document: { documentElement: {}, addEventListener() {} }, URL, URLSearchParams, location: { origin: 'http://localhost' } })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/music_experience.js'), 'utf8'), context)
  for (const download of [false, true]) {
    const item = { id: 'local-1', source: 'custom', isLocal: true, _localFilename: '@directory/song.wav', _localFolder: 'custom', _isCustomDir: true,
      url: '/api/music/custom/file?token=expired', hasCover: false, coverType: 'none', ...(download ? { serverDownloadId: 'download-1', _localFolder: 'download' } : {}) }
    const result = context.window.MusicExperience.playable(item), url = new URL(result.url, 'http://localhost')
    assert.equal(url.searchParams.get('token'), 'current-token')
    assert.equal(url.pathname, download ? '/api/music/server-download/file/download-1' : '/api/music/custom/file')
    assert.equal(url.searchParams.get(download ? 'username' : 'user'), 'alice')
  }
})

/** 模拟媒体事件与真实经过时间，验证播放时长不依赖进度条位置。 */
function playbackFixture() {
  let clock = 0
  const calls = [], listeners = new Map()
  const audio = { currentTime: 0, paused: true, ended: false, seeking: false, error: null, readyState: 4, playbackRate: 1,
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list) } }
  const emit = name => { for (const fn of listeners.get(name) || []) fn() }
  const tracker = new PlaybackTracker(audio, { now: () => clock, onQualified: (...args) => calls.push(args) })
  const song = id => ({ id, source: 'wy', name: '测试歌曲' + id })
  tracker.prepare(song('a'), 'flac')
  return { audio, tracker, calls, emit, song,
    advance(seconds, progress = seconds) { clock += seconds * 1000; audio.currentTime += progress; emit('timeupdate') },
    start() { audio.paused = false; emit('playing') } }
}

test('加载和播放失败不计数，十秒不计数，超过十秒仅记一次', () => {
  const f = playbackFixture()
  f.advance(20, 0); assert.equal(f.calls.length, 0)
  f.audio.error = new Error('播放失败'); f.emit('playing'); f.advance(20, 20)
  assert.equal(f.calls.length, 0)
  f.audio.error = null; f.audio.currentTime = 0; f.start()
  f.advance(10); assert.equal(f.calls.length, 0)
  f.advance(.01); assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][2].playbackSucceeded, true)
  assert.ok(f.calls[0][2].playedSeconds > 10)
  assert.ok(f.calls[0][2].playbackId)
  f.advance(100); assert.equal(f.calls.length, 1)
})

test('暂停和缓冲不累计，恢复继续累计同一次播放', () => {
  const f = playbackFixture(); f.start(); f.advance(4)
  f.audio.paused = true; f.emit('pause'); f.advance(50, 0)
  f.start(); f.advance(3); f.audio.readyState = 2; f.emit('waiting'); f.advance(50, 0)
  f.audio.readyState = 4; f.emit('playing'); f.advance(3)
  assert.equal(f.calls.length, 0)
  f.advance(.1); assert.equal(f.calls.length, 1)
  assert.ok(f.calls[0][2].playedSeconds < 11)
})

test('拖动和恢复到旧进度不计跳过时长，倍速以实际收听时间累计', () => {
  const f = playbackFixture(); f.start(); f.advance(3)
  f.audio.seeking = true; f.audio.currentTime = 120; f.emit('seeking'); f.advance(5, 0)
  f.audio.seeking = false; f.emit('seeked'); f.advance(7)
  assert.equal(f.calls.length, 0)
  f.advance(.1); assert.equal(f.calls.length, 1)
  const fast = playbackFixture(); fast.audio.currentTime = 100; fast.audio.playbackRate = 2; fast.start()
  fast.advance(5, 10); assert.equal(fast.calls.length, 0)
  fast.advance(5.1, 10.2); assert.equal(fast.calls.length, 1)
})

test('换源保留同曲会话，主动重播重新计数，快速切歌和账号变化不串记录', () => {
  const f = playbackFixture(); f.start(); f.advance(6); f.tracker.suspend()
  f.tracker.prepare(f.song('a'), '320k', true); f.audio.currentTime = 0; f.start(); f.advance(4.1)
  assert.equal(f.calls.length, 1); const firstId = f.calls[0][2].playbackId
  f.tracker.suspend(); f.tracker.prepare(f.song('a'), 'flac', true); f.start(); f.advance(11)
  assert.equal(f.calls.length, 1)
  f.tracker.prepare(f.song('a'), 'flac'); f.audio.currentTime = 0; f.start(); f.advance(11)
  assert.equal(f.calls.length, 2); assert.notEqual(firstId, f.calls[1][2].playbackId)
  f.tracker.prepare(f.song('b'), 'flac'); f.start(); f.advance(4)
  f.tracker.prepare(f.song('c'), 'flac'); f.start(); f.advance(7)
  assert.equal(f.calls.length, 2)
  f.tracker.reset(); f.advance(20); assert.equal(f.calls.length, 2)
})

test('播放结束前跨过门槛仍会计数，没有进度变化和媒体错误不能累计', () => {
  const f = playbackFixture(); f.start(); f.advance(9)
  f.audio.currentTime += 2; f.advance(2, 0); f.audio.ended = true; f.emit('ended')
  assert.equal(f.calls.length, 1)
  const stalled = playbackFixture(); stalled.start(); stalled.advance(30, 0)
  stalled.audio.error = new Error('解码失败'); stalled.emit('error'); stalled.advance(30)
  assert.equal(stalled.calls.length, 0)
})

test('公共排序按次数与时间降序，旧数据显示零次且不改变输入数组', () => {
  const input = [{ id: 'legacy', playedAt: 50 }, { id: 'b', playCount: 2, playedAt: 2 }, { id: 'a', playCount: 2, playedAt: 1 }, { id: 'top', playCount: 3, playedAt: 0 }]
  assert.deepEqual(sortByPlayCount(input).map(item => item.id), ['top', 'b', 'a', 'legacy'])
  assert.equal(input[0].id, 'legacy')
  for (const value of [undefined, -1, 1.5, '9', NaN]) assert.equal(playCount({ playCount: value }), 0)
})

test('最近播放显示表头、次数及正确播放顺序，音乐库详情保留专辑顺序', () => {
  const element = () => ({ children: [], setAttribute() {}, classList: { toggle() {} }, append(...nodes) { this.children.push(...nodes) }, replaceChildren() { this.children = [] } })
  const nodes = new Map(['recent-list', 'recent-title', 'recent-meta', 'recent-clear'].map(id => [id, element()]))
  let playlist, bound; const boundArtwork = []
  const window = { PlayStatistics: { sortByPlayCount, playCount }, LibraryArtwork: { attach() {}, bind(image, song) { boundArtwork.push({ image, song }) } },
    MusicExperience: { playable: song => song, coverCandidates: () => [] }, SongFileStatus: { update(host, items, selector) { bound = { items, selector } } },
    updatePlaylist(songs, index) { playlist = { songs, index } } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/views/recent/RecentView.js'), 'utf8'), {
    window, document: { getElementById: id => nodes.get(id), querySelector: () => null, createElement: element, createTextNode: textContent => ({ textContent }) },
  })
  const songs = [{ id: 'low', name: '少次歌曲', singer: '歌手', source: 'wy', playCount: 1, playedAt: 2, albumName: '专辑甲' },
    { id: 'high', name: '多次歌曲', singer: '歌手', source: 'wy', playCount: 3, playedAt: 1, albumName: '专辑乙' }]
  window.RecentView.show('最近播放', songs, true, 100)
  const [header, first, second] = nodes.get('recent-list').children
  assert.match(header.innerHTML, /RecentView.toggleSort/); assert.match(header.innerHTML, /RecentView.toggleBatch/); assert.match(header.innerHTML, /RecentView.toggleSearch/);
  assert.match(header.innerHTML, /歌曲 \/ 歌手/); assert.match(header.innerHTML, /播放次数 ↓/); assert.match(header.innerHTML, /最近播放时间/)
  assert.equal(first.children[3].textContent, '3 次'); assert.equal(second.children[3].textContent, '1 次')
  assert.equal(first.children[2].children[0].className, 'song-file-title')
  assert.equal(boundArtwork[0].song.id, 'high', '最近列表把封面交给统一视口懒加载器')
  window.RecentView.toggleSort();
  assert.equal(nodes.get('recent-list').children[1].children[2].children[0].textContent, '多次歌曲');
  window.RecentView.toggleBatch(); window.RecentView.selectAll();
  assert.equal(window.RecentView.selectedSongs().length, 2);
  window.RecentView.toggleBatch(); window.RecentView.toggleSort();
  assert.equal(bound.selector, '.recent-song-info strong'); assert.deepEqual(bound.items.map(song => song.id), ['high', 'low'])
  second.onclick(); assert.equal(playlist.songs.length, 1); assert.equal(playlist.songs[0].id, 'low'); assert.equal(playlist.index, 0)
  window.RecentView.show('专辑详情', songs)
  assert.match(nodes.get('recent-list').children[0].innerHTML, /专辑/)
  assert.equal(nodes.get('recent-list').children[1].children[3].textContent, '专辑甲')
  window.RecentView.show('最近播放', [], true, 100)
  assert.equal(nodes.get('recent-list').children[0].className, 'recent-table-header')
  assert.equal(nodes.get('recent-list').children[1].className, 'recent-empty')
})

test('旧服务端缺少模糊度时保留当前百分比，完整响应仍采用规范值', async () => {
  const controls = ['glassBlur', 'opacity'].map(key => ({ dataset: { experienceControl: key }, parentElement: { querySelector: () => outputs[key] } }))
  const outputs = { glassBlur: {}, opacity: {} }, styles = new Map(), cache = new Map()
  const root = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) }, classList: { add() {}, toggle() {} } }
  const preview = { style: {}, classList: { toggle() {} } }
  let reply = { theme: 'pink', appearance: 'system', opacity: 0.3 }
  const context = vm.createContext({ window: { getUserAuthHeaders: () => ({ 'x-user-name': 'alice', 'x-user-token': 'test' }), ThemeControls: { colors: [] } },
    document: { documentElement: root, querySelectorAll: () => controls, getElementById: () => preview, addEventListener() {} },
    localStorage: { setItem: (key, value) => cache.set(key, value) }, setTheme() {}, setAppearance() {}, URL,
    fetch: async () => ({ ok: true, json: async () => reply })
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/music_experience.js'), 'utf8'), context)
  for (const strength of [0, 50, 100]) {
    await context.window.MusicExperience.change({ glassBlur: strength })
    assert.equal(context.window.MusicExperience.value.glassBlur, strength)
    assert.equal(outputs.glassBlur.value, strength + '%')
    assert.equal(styles.get('--surface-blur'), strength * .4 + 'px')
    assert.equal(JSON.parse(cache.get('lx_experience:alice')).glassBlur, strength)
  }
  reply = { ...reply, glassBlur: 0 }
  await context.window.MusicExperience.change({ glassBlur: 75 })
  assert.equal(outputs.glassBlur.value, '0%', '服务端明确返回 0 时不使用回退值')
})
