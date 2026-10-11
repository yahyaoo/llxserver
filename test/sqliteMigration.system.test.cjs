/** 临时完整服务器：旧数据迁移、JSON 上传、库隔离、越权拒绝及重启验证。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const Database = require('better-sqlite3')
const project = path.resolve(__dirname, '..')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

test('真实系统：迁移旧 JSON、事务覆盖、库隔离、浏览器存储与重启', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-sqlite-system-'))
  const data = path.join(root, 'data'), open = path.join(data, 'users/_open')
  fs.mkdirSync(path.join(open, 'list/snapshot'), { recursive: true })
  const legacySettings = { preferredQuality: '320k', enableServerCache: false }
  const legacySong = { id: 'wy_old', name: '原歌曲', source: 'wy', meta: { extension: '保留' } }
  const legacyLists = { defaultList: [legacySong], loveList: [], userList: [] }
  fs.writeFileSync(path.join(open, 'settings.json'), JSON.stringify(legacySettings))
  fs.writeFileSync(path.join(open, 'list/snapshotInfo.json'), JSON.stringify({ latest: 'old', time: 10, list: [], clients: {} }))
  fs.writeFileSync(path.join(open, 'list/snapshot/snapshot_old'), JSON.stringify(legacyLists))
  const config = path.join(root, 'config.js')
  fs.writeFileSync(config, 'module.exports = ' + JSON.stringify({ disableTelemetry: true, 'frontend.password': 'system-test', 'player.enableAuth': false,
    'user.enablePublicRestriction': true, 'configBackup.enable': false, users: [{ name: 'alice', password: 'alice-test' }, { name: 'bob', password: 'bob-test' }] }))
  // 业务配置仅保存在 SQLite，旧 JS 文件不会在启动时自动导入。
  require('tsx/cjs')
  const { createAdminRepository } = require('../server/admin/repository/AdminRepository.ts')
  const { GlobalConfigurationService } = require('../server/admin/service/GlobalConfigurationService.ts')
  const repository = createAdminRepository(data)
  new GlobalConfigurationService(repository).save(config, require(config))
  repository.close()
  const probe = http.createServer((_req, res) => res.end('ready'))
  let port
  // Windows 临时端口可能命中 Fetch 禁用端口；实际探测可请求后再启动应用。
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
    port = probe.address().port
    let usable = false
    try { usable = (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).ok } catch {}
    await new Promise(resolve => probe.close(resolve))
    if (usable) break
    if (attempt === 99) throw new Error('无法分配可请求的测试端口')
  }
  const origin = `http://127.0.0.1:${port}`
  let child, logs = ''
  const admin = { 'x-frontend-auth': 'system-test', 'Content-Type': 'application/json' }
  const start = async () => {
    const bootstrap = `require(${JSON.stringify(path.join(project, 'server/modules/utils/musicSdk/index.js'))}).default.init = async () => {}; require(${JSON.stringify(path.join(project, 'server/index.ts'))});`
    child = spawn(process.execPath, ['-r', 'tsx/cjs', '-e', bootstrap], { cwd: project, windowsHide: true, env: { ...process.env, PORT: String(port), BIND_IP: '127.0.0.1',
      DATA_PATH: data, LOG_PATH: path.join(root, 'logs'), CONFIG_PATH: config, STATIC_PATH: path.join(project, 'client'), NODE_ENV: 'production' } })
    child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('服务器退出：' + logs.slice(-2500))
      try { const loggedIn = await fetch(origin + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password: 'system-test' }) }); if (loggedIn.ok) { admin['x-admin-token'] = (await loggedIn.json()).token; return } } catch {}
      await wait(100)
    }
    throw new Error('服务器启动超时：' + logs.slice(-2500))
  }
  const stop = async () => { if (child && child.exitCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended } }
  const post = (route, value, headers = admin) => fetch(origin + route, { method: 'POST', headers, body: JSON.stringify(value) })
  const get = async (route, headers = admin) => { const response = await fetch(origin + route, { headers }); assert.equal(response.status, 200, route); return response.json() }
  const importRoute = '/api/music/configuration/import'
  try {
    await start()
    assert.deepEqual(await get('/api/user/settings'), legacySettings)
    assert.deepEqual((await get('/api/data?user=_open')).defaultList, [legacySong])
    assert.equal(fs.existsSync(path.join(data, 'database/admin.sqlite')), true)
    assert.equal(fs.existsSync(path.join(data, 'database/music.sqlite')), true)
    assert.equal((await post(importRoute, { settings: { preferredQuality: 'flac' } }, { 'Content-Type': 'application/json' } )).status, 401)
    const oldSettingsText = fs.readFileSync(path.join(open, 'settings.json'), 'utf8')
    const song = { id: 'wy_new', name: '迁移中文歌曲', source: 'wy', meta: { unknown: '扩展' } }
    const lists = { defaultList: [song, song], loveList: [song], userList: [{ id: 'list_1', name: '自定义歌单', list: [song] }] }
    const payload = { settings: { preferredQuality: 'flac', volume: 0.6 }, lists, soundEffects: { equalizer: [1, 2, 3] }, library: { artists: [{ id: 'a', name: '歌手', source: 'wy' }], albums: [] } }
    const form = new FormData()
    form.append('file', new Blob(['\uFEFF' + JSON.stringify(payload)], { type: 'application/json' }), '洛雪配置.json')
    const upload = await fetch(origin + importRoute, { method: 'POST', headers: { 'x-frontend-auth': 'system-test', 'x-admin-token':admin['x-admin-token'] }, body: form })
    assert.equal(upload.status, 200, await upload.clone().text())
    assert.equal((await upload.json()).songs, 4)
    assert.deepEqual(await get('/api/user/settings'), payload.settings)
    assert.deepEqual((await get('/api/data?user=_open')).defaultList, lists.defaultList)
    assert.deepEqual((await get('/api/data?user=_open')).userList, lists.userList)
    assert.equal((await fetch(origin + '/api/user/sound-effects', { headers: admin })).status, 401)
    assert.equal(fs.readFileSync(path.join(open, 'settings.json'), 'utf8'), oldSettingsText)
    assert.equal((await post(importRoute, { settings: { changed: true }, library: { artists: 'bad' } })).status, 400)
    assert.deepEqual(await get('/api/user/settings'), payload.settings)
    const token = (await (await post('/api/user/login', { username: 'alice', password: 'alice-test' })).json()).token
    assert.ok(token)
    const alice = { 'x-user-token': token, 'x-user-name': 'alice', 'Content-Type': 'application/json' }
    assert.equal((await post(importRoute, { settings: { preferredQuality: '128k' } }, alice)).status, 200)
    assert.deepEqual(await get('/api/user/settings', alice), { preferredQuality: '128k' })
    assert.equal((await post(importRoute, { soundEffects: payload.soundEffects }, alice)).status, 200)
    assert.deepEqual(await get('/api/user/sound-effects', alice), payload.soundEffects)
    assert.equal((await post(importRoute, { settings: { illegal: true } }, { ...alice, 'x-user-name': 'bob' })).status, 403)
    assert.deepEqual(await get('/api/user/settings'), payload.settings)
    const browserHeaders = { ...alice, 'x-browser-device': 'test-device-123456789' }
    assert.equal((await fetch(origin + '/api/music/storage/list', { method: 'PUT', headers: browserHeaders, body: JSON.stringify(lists) })).status, 200)
    assert.deepEqual((await get('/api/music/storage/list', browserHeaders)).value, lists)
    assert.equal((await get('/api/music/storage/list', { ...browserHeaders, 'x-browser-device': 'another-device-12345' })).value, null)
    const db = new Database(path.join(data, 'database/music.sqlite'), { readonly: true })
    const adminDb = new Database(path.join(data, 'database/admin.sqlite'), { readonly: true })
    try {
      assert.ok(db.prepare('SELECT COUNT(*) AS count FROM client_settings').get().count > 0)
      assert.equal(adminDb.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'client_settings'").get().count, 0)
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'server_user'").get().count, 0)
      assert.ok(adminDb.prepare('SELECT COUNT(*) AS count FROM server_user').get().count > 0)
    } finally { db.close(); adminDb.close() }
    await stop(); await start()
    assert.deepEqual(await get('/api/user/settings'), payload.settings)
    assert.deepEqual((await get('/api/data?user=_open')).defaultList, lists.defaultList)
    const newToken = (await (await post('/api/user/login', { username: 'alice', password: 'alice-test' })).json()).token
    assert.deepEqual((await get('/api/music/storage/list', { ...browserHeaders, 'x-user-token': newToken })).value, lists)
    assert.equal((await fetch(origin + '/music/views/settings/ConfigurationImport.js')).status, 200)
  } finally {
    await stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
