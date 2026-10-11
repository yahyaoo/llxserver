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
  assert.equal(w.MusicExperience.coverUrl({ id: 'one', source: 'wy' }), null)
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
