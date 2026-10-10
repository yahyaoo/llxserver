/** 歌单导入真实 HTTP、SQLite 持久化与用户隔离测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Database = require('better-sqlite3')
const { startAccountRuntime } = require('./helpers/accountRuntime.cjs')

test('歌单导入追加入库、BOM 文件、账号隔离、非法文件回滚及重启恢复', { timeout: 60000 }, async () => {
  const runtime = await startAccountRuntime({ 'user.enablePublicFavorites': true })
  const route = '/api/music/playlists/import'
  const post = (url, value, headers) => fetch(runtime.origin + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) })
  const login = async username => {
    const response = await post('/api/user/login', { username, password: username === 'alice' ? 'alice123' : 'bob12345' })
    assert.equal(response.status, 200)
    return { 'x-user-token': (await response.json()).token, 'x-user-name': username }
  }
  const getLists = async headers => {
    const response = await fetch(runtime.origin + '/api/user/list', { headers })
    assert.equal(response.status, 200)
    return response.json()
  }
  const song = { id: 'wy_import', name: '导入中文歌', source: 'wy', meta: { songId: 'import', unknown: '保留' } }
  const playlist = { id: 'same-id', name: '中文歌单', source: 'wy', sourceListId: '123', extra: '保留', list: [song, song] }
  const exported = { type: 'lxserver-playlist', version: 1, playlist }
  try {
    const alice = await login('alice'), bob = await login('bob')
    assert.equal((await post(route, exported)).status, 401)
    assert.equal((await post(route + '?user=bob', exported, alice)).status, 403)
    assert.equal((await post(route + '?user=_open', exported, alice)).status, 403)
    assert.deepEqual((await getLists(bob)).userList, [])
    const first = await post(route, exported, alice)
    assert.equal(first.status, 200, await first.clone().text())
    const result = await first.json()
    assert.equal(result.playlists, 1); assert.equal(result.songs, 2)
    assert.equal(result.username, 'alice')
    assert.deepEqual(result.lists.userList[0].list, [song, song])
    assert.notEqual(result.lists.userList[0].id, playlist.id)

    const form = new FormData()
    form.append('file', new Blob(['\uFEFF' + JSON.stringify({ type: 'playList_v2', data: [{ id: 'default', list: [song] }, playlist] })], { type: 'application/json' }), '洛雪歌单.json')
    const uploaded = await fetch(runtime.origin + route, { method: 'POST', headers: alice, body: form })
    assert.equal(uploaded.status, 200, await uploaded.clone().text())
    assert.equal((await uploaded.json()).playlists, 2)
    let saved = await getLists(alice)
    assert.equal(saved.userList.length, 3)
    assert.deepEqual(saved.defaultList, [])
    assert.deepEqual(saved.userList[0], result.lists.userList[0])
    assert.equal(saved.userList[1].name, '默认列表')
    assert.equal(saved.userList[2].extra, '保留')
    const before = JSON.stringify(saved)
    const malformed = { type: 'playList_v2', data: [playlist, { id: 'bad', name: '损坏', list: [{}] }] }
    assert.equal((await post(route, malformed, alice)).status, 400)
    assert.equal((await post(route, { settings: { volume: 1 } }, alice)).status, 400)
    assert.equal(JSON.stringify(await getLists(alice)), before)
    assert.deepEqual((await getLists(bob)).userList, [])

    const concurrent = await Promise.all([post(route, exported, alice), post(route, exported, alice)])
    for (const response of concurrent) assert.equal(response.status, 200)
    saved = await getLists(alice)
    assert.equal(saved.userList.length, 5)
    assert.equal(new Set(saved.userList.map(item => item.id)).size, 5)
    const publicResponse = await post(route + '?user=_open', exported, runtime.admin)
    assert.equal(publicResponse.status, 200, await publicResponse.clone().text())

    const database = new Database(path.join(runtime.root, 'data/database/music.sqlite'), { readonly: true })
    try {
      const rows = database.prepare("SELECT value_json FROM client_snapshot WHERE record_key = 'userList'").all()
      assert.ok(rows.some(row => JSON.stringify(JSON.parse(row.value_json)) === JSON.stringify(saved.userList)), '完整歌单已写入真实 SQLite')
    } finally { database.close() }
    await runtime.restart()
    assert.deepEqual((await getLists(await login('alice'))).userList, saved.userList)
    assert.deepEqual((await getLists(await login('bob'))).userList, [])
    const publicData = await (await fetch(runtime.origin + '/api/data?user=_open', { headers: runtime.admin })).json()
    assert.equal(publicData.userList.length, 1)
    assert.deepEqual(publicData.userList[0].list, [song, song])
    assert.equal((await fetch(runtime.origin + '/music/views/main-navigation/PlaylistActions.js')).status, 200)
  } finally { await runtime.stop() }
})
