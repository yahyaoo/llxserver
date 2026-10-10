/** 从当前源码启动服务，验证账号、SQLite、检索、背景及重启。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http')
const { spawn } = require('node:child_process')
const Database = require('better-sqlite3')
const project = path.resolve(__dirname, '..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('真实 HTTP：搜索分组、头像缓存、主题上传与丢失回退、账号历史隔离和重启', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-experience-system-')), data = path.join(root, 'data')
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const origin = `http://127.0.0.1:${port}`, admin = { 'x-frontend-auth': 'experience-test', 'Content-Type': 'application/json' }
  let child, logs = ''
  const start = async () => {
    const setup = `require(${JSON.stringify(path.join(project, 'server/modules/utils/musicSdk/index.js'))}).default.init=async()=>{};require(${JSON.stringify(path.join(project, 'server/index.ts'))});`
    child = spawn(process.execPath, ['-r', 'tsx/cjs', '-e', setup], { cwd: root, windowsHide: true, env: { ...process.env, NODE_PATH: path.join(project, 'node_modules'), CONFIG_PATH: path.join(root, 'config.js'), DATA_PATH: data, LOG_PATH: path.join(root, 'logs'), STATIC_PATH: path.join(project, 'client'), PORT: String(port), FRONTEND_PASSWORD: 'experience-test', DISABLE_TELEMETRY: 'true', NODE_ENV: 'test' } })
    child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
    for (let i = 0; i < 180; i++) {
      if (child.exitCode !== null) throw new Error('启动失败：' + logs.slice(-3500))
      try { const loggedIn = await fetch(origin + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password: 'experience-test' }) }); if (loggedIn.ok) { admin['x-admin-token'] = (await loggedIn.json()).token; return } } catch {}
      await sleep(100)
    }
    throw new Error('启动超时：' + logs.slice(-3500))
  }
  const stop = async () => { if (child && child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done } }
  const json = async (url, headers, method = 'GET', value) => {
    const response = await fetch(origin + url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })
    assert.equal(response.status, 200, await response.clone().text()); return response.json()
  }
  const login = async username => { const result = await json('/api/user/login', admin, 'POST', { username, password: username + '-test' }); return { 'x-user-name': username, 'x-user-token': result.token } }
  try {
    await start()
    await json('/api/config/import', admin, 'POST', { content: "module.exports={'player.enableAuth':false,users:[{name:'alice',password:'alice-test'},{name:'bob',password:'bob-test'}]}" })
    const alice = await login('alice'), bob = await login('bob')
    assert.ok(alice['x-user-token'])
    assert.equal((await fetch(origin + '/api/user/recent', { headers: { 'x-user-name': 'alice', 'x-user-token': 'invalid' } })).status, 401)
    let value = await json('/api/user/appearance', alice)
    assert.equal(value.recentLimit, 100)
    value = await json('/api/user/appearance', alice, 'PUT', { ...value, username: 'bob', theme: 'custom', color: '#234567', opacity: 1, glassBlur: 0, recentLimit: 2 })
    assert.equal(value.opacity, 1); assert.equal(value.glassBlur, 0)
    assert.equal((await json('/api/user/appearance', bob)).glassBlur, 60)
    for (const id of ['one', 'two', 'three', 'two']) await json('/api/user/recent', alice, 'POST', { id, source: 'wy', name: '中文歌曲' + id, singer: '歌手' })
    assert.deepEqual((await json('/api/user/recent', alice)).items.map(song => song.id), ['two', 'three'])
    assert.deepEqual((await json('/api/user/recent', { ...alice, 'x-user-name': 'bob' })).items.map(song => song.id), ['two', 'three'])
    assert.deepEqual((await json('/api/user/recent', bob)).items, [])
    assert.equal((await json('/api/user/appearance', bob)).theme, 'pink')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')
    let response = await fetch(origin + '/api/user/appearance/background', { method: 'POST', headers: alice, body: png }); assert.equal(response.status, 200); const { file } = await response.json()
    value = await json('/api/user/appearance', alice, 'PUT', { ...value, background: { file, x: 20, y: 80, blur: 12 } })
    response = await fetch(origin + '/api/user/appearance/background', { headers: alice }); assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
    assert.equal((await fetch(origin + '/api/user/appearance/background', { headers: bob })).status, 404)
    assert.equal((await fetch(origin + '/api/user/appearance/background', { method: 'POST', headers: alice, body: '<svg />' })).status, 400)
    const cache = path.join(root, 'cache/alice'); fs.mkdirSync(cache, { recursive: true })
    // 使用实际本地音频文件让服务端完成索引扫描；无需依赖外部音源。
    const wav = Buffer.alloc(44 + 1600); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40)
    fs.writeFileSync(path.join(cache, '晴天 - 周杰伦.wav'), wav)
    const tagger = new (require('music-tag-native').MusicTagger)()
    tagger.loadPath(path.join(cache, '晴天 - 周杰伦.wav'))
    tagger.title = '晴天'; tagger.artist = '周杰伦'; tagger.album = '叶惠美'; tagger.save(); tagger.dispose()
    await json('/api/music/cache/sync', alice, 'POST', {})
    const search = await json('/api/music/library/search?q=' + encodeURIComponent('晴天'), alice)
    assert.ok(search.songs.length > 0)
    const singerSearch = await json('/api/music/library/search?q=' + encodeURIComponent('周杰伦'), alice)
    assert.ok(singerSearch.artists.length > 0)
    const albumSearch = await json('/api/music/library/search?q=' + encodeURIComponent('叶惠美'), alice)
    assert.equal(albumSearch.albums[0].name, '叶惠美')
    assert.equal((await json('/api/music/library/search?q=' + encodeURIComponent('晴天'), bob)).songs.length, 0)
    const artistDir = path.join(cache, 'artist-avatars'); fs.mkdirSync(artistDir, { recursive: true }); const hash = require('node:crypto').createHash('sha256').update('周杰伦').digest('hex'); fs.writeFileSync(path.join(artistDir, hash + '.img'), png)
    assert.equal((await fetch(origin + '/api/music/library/avatar?name=' + encodeURIComponent('周杰伦'), { headers: alice })).status, 200)
    const db = new Database(path.join(data, 'database/music.sqlite'), { readonly: true })
    try {
    assert.ok(db.prepare('SELECT count(*) AS n FROM client_recent_play').get().n === 2)
    assert.ok(db.prepare('SELECT count(*) AS n FROM client_appearance').get().n > 0)
    assert.equal(db.prepare("SELECT count(*) AS n FROM client_appearance WHERE record_key = 'recentLimit'").get().n, 0)
    const aliceRecentKey = 'data:users/alice_' + require('node:crypto').createHash('md5').update('alice').digest('hex').slice(0, 6) + '/recent-setting.json'
    assert.equal(db.prepare("SELECT value_json FROM client_recent_setting WHERE record_key = 'maxRecords' AND document_key = ?").get(aliceRecentKey).value_json, '2')
    } finally { db.close() }
    await stop(); await start(); const reauthenticated = await login('alice')
    assert.equal((await json('/api/user/appearance', reauthenticated)).background.file, file)
    assert.equal((await json('/api/user/appearance', reauthenticated)).recentLimit, 2)
    assert.equal((await json('/api/user/appearance', reauthenticated)).opacity, 1)
    assert.equal((await json('/api/user/appearance', reauthenticated)).glassBlur, 0)
    assert.equal((await json('/api/user/recent', reauthenticated)).items.length, 2)
    fs.unlinkSync(path.join(cache, 'theme-backgrounds', file))
    value = await json('/api/user/appearance', reauthenticated); assert.equal(value.theme, 'pink'); assert.equal(value.background, null)
    await json('/api/user/recent', reauthenticated, 'DELETE'); assert.deepEqual((await json('/api/user/recent', reauthenticated)).items, [])
    const page = await fetch(origin + '/', { headers: reauthenticated }); const html = await page.text(); assert.ok(html.includes('components/top-bar/index.js'), page.url + ' ' + page.status); assert.ok(!html.includes('id="lm-quick-search"'))
  } finally { await stop(); fs.rmSync(root, { recursive: true, force: true }) }
})
