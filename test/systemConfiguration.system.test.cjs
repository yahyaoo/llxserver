/** 系统配置真实接口、两库在线迁移、备份还原与重启测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn } = require('node:child_process')
const Database = require('better-sqlite3')
const project = path.resolve(__dirname, '..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('系统配置：显式导入、独立迁库、失败保留、SQLite备份还原及重启', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-system-configuration-')), data = path.join(root, 'data'), bootstrap = path.join(root, 'config.js')
  fs.mkdirSync(data, { recursive: true })
  // 故意提供旧业务字段，启动必须忽略它们。
  fs.writeFileSync(bootstrap, 'module.exports={serverName:"旧文件不能生效",port:1234}')
  const probe = http.createServer((_req, res) => res.end('ready'))
  let port
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); port = probe.address().port
    let usable = false
    try { usable = (await fetch(`http://127.0.0.1:${port}`)).ok } catch {}
    await new Promise(resolve => probe.close(resolve)); if (usable) break
  }
  const origin = `http://127.0.0.1:${port}`, headers = { 'x-frontend-auth': 'system-config-test', 'Content-Type': 'application/json' }
  let child, logs = ''
  const start = async () => {
    const setup = `require(${JSON.stringify(path.join(project, 'server/modules/utils/musicSdk/index.js'))}).default.init=async()=>{};require(${JSON.stringify(path.join(project, 'index.js'))});`
    child = spawn(process.execPath, ['-e', setup], { cwd: project, windowsHide: true, env: { ...process.env, CONFIG_PATH: bootstrap, DATA_PATH: data, LOG_PATH: path.join(root, 'logs'), STATIC_PATH: path.join(project, 'public'), PORT: String(port), FRONTEND_PASSWORD: 'system-config-test', DISABLE_TELEMETRY: 'true', NODE_ENV: 'production' } })
    child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('启动失败：' + logs.slice(-3000))
      try { if ((await fetch(origin + '/api/config', { headers })).ok) return } catch {}
      await sleep(100)
    }
    throw new Error('启动超时：' + logs.slice(-3000))
  }
  const stop = async () => { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited } }
  const post = (url, body, requestHeaders = headers) => fetch(origin + url, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) })
  const get = async url => { const response = await fetch(origin + url, { headers }); assert.equal(response.status, 200, await response.clone().text()); return response.json() }
  try {
    await start()
    const initial = await get('/api/config')
    assert.equal(initial.serverName, 'lxserver'); assert.equal(initial.port, port)
    assert.equal(initial['update.token'], undefined)
    assert.ok(initial.additionalFields.some(field => field.key === 'subsonic.transcode.maxConcurrent'))
    assert.ok(initial.additionalFields.some(field => field.key === 'artist.maxFetchPages'))
    assert.equal((await post('/api/config/import', { content: 'module.exports={serverName:"unauthorized"}' }, { 'Content-Type': 'application/json' })).status, 401)
    const input = "/*旧文件*/module.exports={serverName:'旧配置导入', 'subsonic.transcode.enabled':true, 'subsonic.transcode.maxConcurrent':3, users:[{name:'alice',password:'alice-test'}], 'database.adminPath':'ignore.sqlite',}"
    let response = await post('/api/config/import', { content: input })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await response.json()).restartRequired, true)
    assert.equal((await get('/api/config')).serverName, '旧配置导入')
    assert.equal((await get('/api/config'))['database.adminPath'], initial['database.adminPath'])
    assert.equal((await post('/api/user/login', { username: 'alice', password: 'alice-test' })).status, 200)
    assert.equal((await post('/api/config/import', { content: 'module.exports={serverName:"不可覆盖",port:70000}' })).status, 400)
    assert.equal((await get('/api/config')).serverName, '旧配置导入')
    assert.equal((await post('/api/config/import', { content: 'module.exports={port:process.exit()}' })).status, 400)
    response = await post('/api/config/backup-now', {})
    const backup = await response.json(); assert.equal(backup.success, true)
    const text = await (await fetch(origin + '/api/config/backups/download?file=' + encodeURIComponent(backup.filename), { headers })).text()
    assert.ok(text.includes('旧配置导入')); assert.ok(!text.includes('database.adminPath'))
    assert.equal((await post('/api/music/configuration/import', { settings: { preferredQuality: 'flac', retained: '中文' } })).status, 200)
    const paths = { 'database.adminPath': path.join(root, 'moved/admin.sqlite'), 'database.musicPath': path.join(root, 'moved/music.sqlite') }
    response = await post('/api/config', { serverName: '迁移后', ...paths })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await get('/api/config'))['database.adminPath'], paths['database.adminPath'])
    assert.equal(fs.existsSync(initial['database.adminPath']), false)
    assert.equal(fs.existsSync(initial['database.musicPath']), false)
    assert.deepEqual(await get('/api/user/settings'), { preferredQuality: 'flac', retained: '中文' })
    assert.equal((await post('/api/config', { serverName: '失败时不可覆盖', 'database.adminPath': paths['database.musicPath'] })).status, 400)
    assert.equal((await get('/api/config'))['database.adminPath'], paths['database.adminPath'])
    assert.equal((await get('/api/config')).serverName, '迁移后')
    const adminDb = new Database(paths['database.adminPath'], { readonly: true }), musicDb = new Database(paths['database.musicPath'], { readonly: true })
    assert.equal(adminDb.prepare("SELECT count(*) AS n FROM admin_config WHERE record_key LIKE 'database.%'").get().n, 0)
    assert.ok(!musicDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().some(table => table.name === 'admin_config'))
    adminDb.close(); musicDb.close()
    response = await post('/api/config/backups/restore', { fileName: backup.filename })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await get('/api/config')).serverName, '旧配置导入')
    assert.equal((await get('/api/config'))['database.musicPath'], paths['database.musicPath'])
    await stop(); await start()
    assert.equal((await get('/api/config')).serverName, '旧配置导入')
    assert.equal((await get('/api/config'))['database.adminPath'], paths['database.adminPath'])
    assert.deepEqual(await get('/api/user/settings'), { preferredQuality: 'flac', retained: '中文' })
    const html = await (await fetch(origin + '/admin')).text()
    assert.ok(html.includes('views/system-configuration/SystemConfigurationView.js'))
    assert.equal((await fetch(origin + '/views/system-configuration/SystemConfigurationView.js')).status, 200)
    response = await post('/api/config/import', { content: 'module.exports={"frontend.password":"imported-admin-password"}' })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await response.json()).authenticationChanged, true)
    assert.equal((await fetch(origin + '/api/config', { headers })).status, 401)
    assert.equal((await fetch(origin + '/api/config', { headers: { 'x-frontend-auth': 'imported-admin-password' } })).status, 200)
  } finally { await stop(); fs.rmSync(root, { recursive: true, force: true }) }
})
