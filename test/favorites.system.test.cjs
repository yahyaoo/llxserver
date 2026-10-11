/** 独立喜爱的真实 HTTP 与 SQLite 联动验证，使用临时账号。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { startLeaderboardRuntime } = require('./helpers/leaderboardRuntime.cjs')

test('真实接口：独立喜欢、普通歌单保护、移除和重排仍能持久化', { timeout: 60000 }, async () => {
  const runtime = await startLeaderboardRuntime()
  try {
    const request = (url, body, headers = runtime.headers) => fetch(runtime.origin + url, {
      method: body === undefined ? 'GET' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = async (url, body) => {
      const response = await request(url, body)
      assert.equal(response.status, 200, `${url}: ${await response.clone().text()}`)
      return response.json()
    }
    const a = { id: 'wy_favorite_a', name: '测试歌曲甲', source: 'wy', singer: '歌手', meta: { size: 4096, bitDepth: 24, sampleRate: 96000 } }
    const b = { ...a, id: 'wy_favorite_b', name: '测试歌曲乙' }
    await json('/api/user/favorites', { song: a, loved: true })
    await json('/api/user/favorites', { song: b, loved: true })
    const list = await json('/api/user/list')
    await json('/api/user/list', { ...list, loveList: [], userList: [{ id: 'custom', name: '普通歌单', list: [] }] })
    assert.equal((await json('/api/user/favorites')).items.length, 2)
    assert.deepEqual((await json('/api/user/favorites')).items.find(song => song.id === a.id).meta, a.meta)
    assert.equal((await request('/api/music/user/list/add', { listId: 'love', musicInfos: [a] })).status, 400)
    assert.equal((await request('/api/user/favorites', { song: a, loved: true }, { 'x-user-name': 'test' })).status, 401)
    assert.ok([401, 403].includes((await request('/api/user/favorites?user=_open', { song: a, loved: true }, {})).status))
    assert.equal((await request('/api/user/favorites', { song: a, loved: 'true' })).status, 400)

    const reordered = await request('/api/music/user/list/reorder', { listId: 'love', orderedSongIds: [b.id, a.id] })
    assert.equal(reordered.status, 200)
    assert.deepEqual((await json('/api/user/favorites')).items.map(song => song.id), [b.id, a.id])
    const removed = await request('/api/music/user/list/remove', { listId: 'love', songIds: [b.id] })
    assert.equal(removed.status, 200)
    assert.deepEqual((await json('/api/user/list')).loveList.map(song => song.id), [a.id])
    await json('/api/user/favorites', { song: a, loved: false })
    assert.deepEqual((await json('/api/user/favorites')).items, [])
    const normal = await request('/api/music/user/list/add', { listId: 'custom', musicInfos: [a] })
    assert.equal(normal.status, 200)
    assert.equal((await json('/api/user/list')).userList[0].list.length, 1)
  } finally { await runtime.stop() }
})
