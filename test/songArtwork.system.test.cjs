/** 歌曲封面缓存及近期记录的真实 HTTP 回归。 @author jingyh @date 2026-10-11 */
const { test } = require('node:test'), assert = require('node:assert/strict')
const { startLeaderboardRuntime } = require('./helpers/leaderboardRuntime.cjs')
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII='
test('真实接口缓存图片、回写歌曲状态、无源命中缓存与认证隔离', { timeout: 60000 }, async () => {
  const runtime = await startLeaderboardRuntime()
  try {
    const post = async (route, value) => fetch(runtime.origin + route, { method: 'POST', headers: { ...runtime.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
    const song = { id: 'cached', source: 'kg', name: '测试封面', meta: { picUrl: 'https://image.test/album.png?token=secret' }, playbackSucceeded: true, playedSeconds: 11, playbackId: 'fixture-one' }
    let response = await post('/api/user/recent', song); assert.equal(response.status, 200)
    assert.equal((await response.json()).items[0].pic, 'https://image.test/album.png')
    response = await fetch(runtime.origin + '/api/music/artwork?' + new URLSearchParams({ source: song.source, id: song.id, url: image }), { headers: runtime.headers })
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(image.split(',')[1], 'base64'))
    response = await fetch(runtime.origin + '/api/user/recent', { headers: runtime.headers })
    const saved = (await response.json()).items[0]
    assert.equal(saved.artworkCached, true); assert.ok(saved.artworkUrl.includes('/api/music/artwork'))
    assert.equal((await fetch(runtime.origin + saved.artworkUrl, { headers: runtime.headers })).status, 200)
    assert.equal((await fetch(runtime.origin + saved.artworkUrl + '&user=test&token=' + encodeURIComponent(runtime.headers['x-user-token']))).status, 200)
    assert.equal((await fetch(runtime.origin + saved.artworkUrl)).status, 401)
    assert.equal((await fetch(runtime.origin + saved.artworkUrl + '&user=test&token=bad')).status, 401)
    const invalid = '/api/music/artwork?' + new URLSearchParams({ source: 'kg', id: 'invalid', url: 'data:image/png;base64,aGVsbG8=' })
    assert.equal((await fetch(runtime.origin + invalid, { headers: runtime.headers })).status, 404)
    for (const source of ['custom', 'local']) {
      const query = new URLSearchParams({ source, id: 'local-cover', url: image })
      const first = await fetch(runtime.origin + '/api/music/artwork?' + query, { headers: runtime.headers })
      assert.equal(first.status, 200)
      query.delete('url')
      const cached = await fetch(runtime.origin + '/api/music/artwork?' + query, { headers: runtime.headers })
      assert.equal(cached.status, 200)
      assert.deepEqual(Buffer.from(await cached.arrayBuffer()), Buffer.from(image.split(',')[1], 'base64'))
    }
  } finally { await runtime.stop() }
})
