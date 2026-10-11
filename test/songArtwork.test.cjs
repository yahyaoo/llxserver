/** 跨列表封面解析与快速换曲回归测试。 @author jingyh @date 2026-10-11 */
const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
function runtime() {
  const window = { getUserAuthHeaders: () => ({ 'x-user-name': 'alice', 'x-user-token': 'current-token' }), currentListData: { loveList: [], userList: [] }, addEventListener() {} }
  vm.runInNewContext(fs.readFileSync('client/music/js/music_experience.js', 'utf8'), { window, document: { documentElement: {}, addEventListener() {} }, URL, URLSearchParams, location: { origin: 'http://localhost' } })
  return window
}
test('在线原始数据、收藏及最近记录读取相同封面，旧记录按标识补齐', () => {
  const w = runtime(), url = 'https://image.test/album.jpg'
  const song = { id: 'one', source: 'kg', name: '歌曲', meta: { picUrl: url } }
  w.currentListData.loveList.push(song)
  for (const item of [song, { id: 'one', source: 'kg' }, { songInfo: song }]) {
    const cached = new URL(w.MusicExperience.coverUrl(item), 'http://localhost')
    assert.equal(cached.pathname, '/api/music/artwork'); assert.equal(cached.searchParams.get('url'), url)
  }
  for (const item of [{ picUrl: url }, { album: { picUrl: url } }]) assert.equal(w.MusicExperience.coverUrl(item), url)
  const otherSource = new URL(w.MusicExperience.coverUrl({ id: 'one', source: 'wy' }), 'http://localhost')
  assert.equal(otherSource.searchParams.get('source'), 'wy'); assert.equal(otherSource.searchParams.has('url'), false)
})
test('丢失图片字段的旧历史直接按账号与歌曲标识读取已有缓存', () => {
  const w = runtime(), url = new URL(w.MusicExperience.coverUrl({ id: 'old', source: 'kg' }), 'http://localhost')
  assert.equal(url.pathname, '/api/music/artwork'); assert.equal(url.searchParams.get('id'), 'old'); assert.equal(url.searchParams.get('user'), 'alice')
  assert.equal(url.searchParams.has('url'), false)
})

test('旧自定义目录索引仍加载封面，显示失败不改内嵌歌词与元数据状态', () => {
  const w = runtime(), item = { id: 'old', source: 'kg', filename: '歌曲.flac', name: '未知歌曲', singer: '未知歌手', hasCover: false, hasEmbedLyric: false, hasLyric: true, metadataWritable: false }
  const image = { dataset: { lmCoverIndex: '0', src: 'placeholder' }, classList: { toggle() {} } }
  const container = { innerHTML: '', querySelectorAll: () => [image] }
  const document = { getElementById: id => id === 'lm-list-container' ? container : null }
  vm.runInNewContext(fs.readFileSync('client/music/components/library-artwork/index.js', 'utf8'), { window: w, URL, location: { origin: 'http://localhost' } })
  vm.runInNewContext(fs.readFileSync('client/music/js/customDir.js', 'utf8'), { window: w, document })
  const manager = w.CustomDirManager
  manager.displayData = [item]; manager.bindEvents = () => {}; manager.updatePagination = () => {}; manager.getPageSlice = () => ({ list: [item], start: 0 })
  manager.render()
  assert.match(container.innerHTML, /lm-cover-image/); assert.match(container.innerHTML, /缺标签/); assert.match(container.innerHTML, /外置词/)
  assert.equal(new URL(image.dataset.src, 'http://localhost').pathname, '/api/music/custom/cover')
  image.onerror()
  assert.equal(item.hasCover, false); assert.equal(item.hasEmbedLyric, false); assert.equal(item.hasLyric, true); assert.equal(item.metadataWritable, false)
})
test('本地文件优先读认证封面且保留在线回退，转换为播放对象后结果一致', () => {
  const w = runtime(), item = { id: 'one', source: 'kg', filename: '专辑/歌曲.flac', folder: 'custom', hasCover: true, meta: { picUrl: 'https://image.test/online.jpg' } }
  const candidates = w.MusicExperience.coverCandidates(item), url = new URL(candidates[0], 'http://localhost')
  assert.equal(url.pathname, '/api/music/custom/cover'); assert.equal(url.searchParams.get('filename'), item.filename)
  assert.equal(url.searchParams.get('user'), 'alice'); assert.equal(url.searchParams.get('token'), 'current-token')
  assert.ok(!w.MusicExperience.coverReference({ pic: '/api/music/cache/cover?filename=x&token=secret' }).includes('token='))
  assert.equal(candidates[2], item.meta.picUrl)
  assert.equal(w.MusicExperience.coverUrl(w.MusicExperience.playable(item)), candidates[0])
  assert.equal(w.MusicExperience.coverUrl({ ...item, hasCover: false }), candidates[0])
})
test('占位图和不安全地址不能抢占真实封面，过期令牌替换为当前凭据', () => {
  const w = runtime()
  assert.equal(w.MusicExperience.coverUrl({ img: '/music/assets/logo.svg', meta: { picUrl: 'javascript:alert(1)' }, picUrl: 'https://image.test/real.jpg' }), 'https://image.test/real.jpg')
  const url = new URL(w.MusicExperience.coverUrl({ pic: '/api/music/cache/cover?filename=x&user=bob&token=stale' }), 'http://localhost')
  assert.equal(url.searchParams.get('user'), 'alice'); assert.equal(url.searchParams.get('token'), 'current-token')
})
