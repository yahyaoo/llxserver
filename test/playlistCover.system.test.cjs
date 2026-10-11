/** 真实 HTTP 验证歌单封面的新增、编辑、移除及旧客户端兼容。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { startLeaderboardRuntime } = require('./helpers/leaderboardRuntime.cjs')
const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
test('真实接口支持封面增改清除，旧客户端和歌单删除均正确处理', { timeout: 60000 }, async () => {
  const runtime = await startLeaderboardRuntime()
  try {
    const request = async body => fetch(runtime.origin + '/api/user/list', { method: body ? 'POST' : 'GET', headers: { ...runtime.headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const read = async () => { const res = await request(); assert.equal(res.status, 200); return res.json() }
    const data = await read()
    data.userList.push({ id: 'cover-list', name: '封面歌单', cover, list: [{ id: 'a', name: '第一首', meta: { picUrl: '/first.png' } }] })
    assert.equal((await request(data)).status, 200)
    let list = (await read()).userList.find(item => item.id === 'cover-list')
    assert.equal(list.cover, cover)
    list.name = '编辑后的歌单'; list.cover = '/old/missing.jpg'
    assert.equal((await request({ ...data, userList: [list] })).status, 200)
    assert.equal((await read()).userList[0].cover, '/old/missing.jpg')
    delete list.cover
    assert.equal((await request({ ...data, userList: [list] })).status, 200)
    assert.equal((await read()).userList[0].cover, '/old/missing.jpg', '旧客户端不覆盖封面')
    list.cover = 'data:image/png;base64,aGVsbG8='
    assert.equal((await request({ ...data, userList: [list] })).status, 400)
    assert.equal((await read()).userList[0].cover, '/old/missing.jpg')
    list.cover = ''
    assert.equal((await request({ ...data, userList: [list] })).status, 200)
    assert.equal((await read()).userList[0].cover, '')
    assert.equal((await request({ ...data, userList: [] })).status, 200)
    assert.deepEqual((await read()).userList, [])
  } finally { await runtime.stop() }
})
