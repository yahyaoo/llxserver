/** 文件参数归一化、标题下展示与歌曲行播放布局回归。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const read = name => fs.readFileSync(path.join(__dirname, '../client/music', name), 'utf8')
const window = {}
vm.runInNewContext(read('js/song_metadata.js'), { window })
const metadata = window.SongMetadata

test('文件大小与位深、采样率同组显示，兼容字节与平台大小字符串', () => {
  assert.deepEqual(Array.from(metadata.values({ size: 26.3 * 1024 * 1024, bitDepth: 24, sampleRate: 96000, bitrate: 320 })), ['26.3 MB', '24bit', '96kHz', '320kbps'])
  assert.deepEqual(Array.from(metadata.values({ meta: { size: '26.3M', bitDepth: 16, sampleRate: 44100 } })), ['26.3 MB', '16bit', '44.1kHz'])
  assert.equal(metadata.formatSize('2 GiB'), '2 GB')
  assert.equal(metadata.formatSize(800), '800 B')
})

test('已选音质使用对应文件大小；仅能力声明不伪造参数', () => {
  const qualities = { '320k': { size: '5MB' }, flac: { size: '26.3M', sampleRate: 44100 }, hires: { isPlatformQuality: true, size: '100M' } }
  assert.deepEqual(Array.from(metadata.values({ _types: qualities })), ['26.3 MB', '44.1kHz'])
  assert.deepEqual(Array.from(metadata.values({ quality: '320k', meta: { _qualitys: qualities } })), ['5 MB'])
  assert.deepEqual(Array.from(metadata.values({ quality: 'hires', meta: { _qualitys: qualities } })), [])
  assert.equal(metadata.render({ size: '<script>1</script>', sampleRate: 'bad', bitDepth: Infinity }), '')
  assert.equal(metadata.render({}), '')
})

test('归一化和本地收藏保留实际文件参数', () => {
  const app = read('app.js'), context = {}
  vm.runInNewContext(app.slice(app.indexOf('function cleanSongData(song)'), app.indexOf('// Modified handler for Grid Buttons')), context)
  const song = context.cleanSongData({ id: 'wy_1', songmid: '1', source: 'wy', name: '测试', size: 4096, bitDepth: 24, sampleRate: 192000 })
  assert.deepEqual(Array.from(metadata.values(song)), ['4 KB', '24bit', '192kHz'])
})

test('加入歌单只列普通歌单，喜爱页隐藏搜索，所有歌曲行操作列没有播放键', () => {
  const app = read('app.js')
  const grid = app.slice(app.indexOf('function renderPlaylistAddGrid('), app.indexOf('function hasPlaylistData('))
  assert.doesNotMatch(grid, /createGridItem\('love'/)
  assert.match(app, /activeView\.dataset\.favoritesView = String\(listId === 'love'\)/)
  for (const file of ['app.js', 'js/leaderboard_manager.js', 'js/songlist_manager.js', 'js/local_music.js', 'js/customDir.js']) {
    assert.doesNotMatch(read(file), /<button\b[^>]*title="播放"[^>]*(?:playFromView|\.playSong|data-lm-action="play")[^>]*>\s*<i class="fas fa-play/)
    assert.match(read(file), /song-cover-play/)
  }
  assert.match(read('css/interactions.css'), /\(hover: none\), \(pointer: coarse\)/)
})
