/** 完整服务器接口测试：临时配置、真实队列、源解析、文件与重启恢复。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn } = require('node:child_process')
const vm = require('node:vm')
const project = path.resolve(__dirname, '..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const frame = Buffer.alloc(417)
Buffer.from([255, 251, 144, 100]).copy(frame)
const audio = Buffer.concat([Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, 0]), ...Array(80).fill(frame)])

test('完整接口：配置持久化、队列下载、本地播放、缓存绝对路径、鉴权及重启', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-download-system-'))
  const data = path.join(root, 'data')
  const configFile = path.join(root, 'config.js')
  let child, logs = '', audioRequests = 0, updateRequests = 0
  const sourceServer = http.createServer((req, res) => {
    if (req.url === '/latest') {
      updateRequests++
      assert.equal(req.headers.authorization, 'token system-test-token')
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ tag_name: 'v2.1.4', html_url: 'https://example.com/release', body: '系统测试发布说明' }))
      return
    }
    audioRequests++; res.writeHead(200, { 'Content-Length': audio.length }); res.end(audio)
  })
  await new Promise(resolve => sourceServer.listen(0, '127.0.0.1', resolve))
  const fixtureUrl = `http://127.0.0.1:${sourceServer.address().port}/audio`
  const probe = http.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const origin = `http://127.0.0.1:${port}`
  const admin = { 'x-frontend-auth': 'lx-system-test', 'Content-Type': 'application/json' }
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(configFile, 'module.exports = ' + JSON.stringify({
    'frontend.password': 'lx-system-test', 'player.enableAuth': true, 'player.password': 'lx-player-test', 'admin.path': '', 'player.path': '/music',
    'user.enablePublicRestriction': true, 'user.enablePublicNonAdminServerCache': false,
    disableTelemetry: true, users: [{ name: 'admin', password: 'lx-user-test', allowWriteCustomMusicDir: true }, { name: 'alice', password: 'lx-alice-test' }], 'configBackup.enable': false,
  }))
  // 业务配置仅保存在 SQLite，旧 JS 文件不会在启动时自动导入。
  const { createAdminRepository } = require('../dist/server/admin/repository/AdminRepository')
  const { GlobalConfigurationService } = require('../dist/server/admin/service/GlobalConfigurationService')
  const repository = createAdminRepository(data)
  new GlobalConfigurationService(repository).save(configFile, require(configFile))
  repository.close()
  const srcDir = path.join(data, 'users/source/_open')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'fixture.js'), `/** @name 系统测试源 */
    lx.on(lx.EVENT_NAMES.request, ({ action }) => { if (action === 'musicUrl') return Promise.resolve(${JSON.stringify(fixtureUrl)}); throw new Error('unexpected action') });
    lx.send(lx.EVENT_NAMES.inited, { sources: { wy: { name: '系统测试源', type: 'music', actions: ['musicUrl'], qualitys: ['320k'] } } });`)
  fs.writeFileSync(path.join(srcDir, 'sources.json'), JSON.stringify([{ id: 'fixture.js', name: '系统测试源', enabled: true }]))
  // 仅测试启动跳过 SDK 外网预热；下载仍通过真实源脚本与队列解析。
  const bootstrap = `require(${JSON.stringify(path.join(project, 'dist/server/modules/utils/musicSdk/index.js'))}).default.init = async () => {}; require(${JSON.stringify(path.join(project, 'index.js'))});`
  const start = async () => {
    child = spawn(process.execPath, ['-e', bootstrap], { cwd: project, windowsHide: true, env: {
      ...process.env, PORT: String(port), BIND_IP: '127.0.0.1', DATA_PATH: data, LOG_PATH: path.join(root, 'logs'),
      CONFIG_PATH: configFile, STATIC_PATH: path.join(project, 'client'), DISABLE_TELEMETRY: 'true', NODE_ENV: 'production',
    } })
    child.stdout.on('data', b => { logs += b })
    child.stderr.on('data', b => { logs += b })
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('服务器启动失败：' + logs.slice(-3000))
      try { if ((await fetch(origin + '/api/config', { headers: admin })).ok) return } catch {}
      await sleep(100)
    }
    throw new Error('服务器启动超时：' + logs.slice(-3000))
  }
  const stop = async () => { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited } }
  const post = (route, body, headers = admin) => fetch(origin + route, { method: 'POST', headers, body: JSON.stringify(body) })
  try {
    await start()
    // 真实静态资源路由：设置工作区和主题导航无需构建即可刷新生效。
    const loginResponse = await post('/api/music/auth', { password: 'lx-player-test' }, { 'Content-Type': 'application/json' })
    assert.equal(loginResponse.status, 200)
    const playerHeaders = { Cookie: loginResponse.headers.get('set-cookie').split(';')[0] }
    const playerPage = await fetch(origin + '/music/', { headers: playerHeaders })
    assert.equal(playerPage.status, 200)
    const playerHtml = await playerPage.text()
    assert.ok(playerHtml.includes('views/settings/SettingsView.js'))
    assert.ok(playerHtml.includes('components/top-bar/index.js'))
    const actions = await fetch(origin + '/music/components/top-bar/AccountActions.js', { headers: playerHeaders })
    assert.equal(actions.status, 200)
    assert.ok((await actions.text()).includes('id="header-theme-menu"'))
    for (const resource of ['/music/views/settings/settings.css', '/music/views/settings/SettingsNavigation.js', '/music/views/settings/SettingsView.js', '/music/views/settings/index.js']) {
      const response = await fetch(origin + resource, { headers: playerHeaders })
      assert.equal(response.status, 200, resource)
      assert.ok((await response.text()).length > 100)
    }
    const disabled = await (await fetch(origin + '/api/app/update/check')).json()
    assert.equal(disabled.enabled, false)
    assert.equal(updateRequests, 0)
    const updateServer = fixtureUrl.replace('/audio', '/latest')
    assert.equal((await post('/api/config', { 'update.enabled': true, 'update.server': 'file:///bad' })).status, 400)
    assert.equal((await post('/api/config', { 'update.enabled': true, 'update.server': updateServer, 'update.token': 'system-test-token' })).status, 200)
    const updated = await (await fetch(origin + '/api/app/update/check')).json()
    assert.equal(updated.hasUpdate, true)
    assert.equal(updated.currentVersion, '2.1.3')
    assert.equal(updateRequests, 1)
    assert.equal(JSON.stringify(await (await fetch(origin + '/api/config', { headers: admin })).json()).includes('system-test-token'), false)
    assert.equal((await fetch(origin + '/js/config.js')).status, 200)
    assert.equal((await (await fetch(origin + '/js/config.js')).text()).includes('system-test-token'), false)
    assert.equal((await post('/api/config', { 'update.enabled': false, 'update.token': '' })).status, 200)
    assert.equal((await (await fetch(origin + '/api/app/update/check')).json()).enabled, false)
    assert.equal(updateRequests, 1)
    assert.equal((await fetch(origin + '/api/config')).status, 401)
    assert.equal((await post('/api/config', { 'download.directory': '../bad' })).status, 400)
    const directory = path.join(root, '下载音乐')
    assert.equal((await post('/api/config', { 'download.directory': directory, 'download.lyricMode': 'external', 'download.nameTemplate': '' })).status, 200)
    const cfg = await (await fetch(origin + '/api/config', { headers: admin })).json()
    assert.equal(cfg['download.directory'], directory)
    assert.equal(cfg['download.lyricMode'], 'external')
    const cacheDirectory = path.join(root, '自定义缓存')
    assert.equal((await post('/api/music/cache/config', { location: cacheDirectory })).status, 200)
    const dirs = await (await fetch(origin + '/api/music/cache/directories', { headers: admin })).json()
    assert.equal(dirs.data.cacheDirectory, path.join(cacheDirectory, 'cache', '_open'))
    const songInfo = { source: 'wy', songmid: '88888', id: 'wy_88888', name: '系统测试歌曲', singer: '测试歌手', quality: '320k' }
    assert.equal((await post('/api/music/cache/download', { songInfo, url: fixtureUrl, quality: '320k', cacheLyric: false, embedLyric: false })).status, 200)
    let cached
    const cacheParams = new URLSearchParams({ name: songInfo.name, singer: songInfo.singer, source: 'wy', songmid: '88888', quality: '320k' })
    for (let i = 0; i < 100; i++) {
      cached = await (await fetch(origin + '/api/music/cache/check?' + cacheParams)).json()
      if (cached.exists) break
      await sleep(100)
    }
    assert.equal(cached.exists, true, logs.slice(-1500))
    assert.ok(fs.readdirSync(path.join(cacheDirectory, 'cache', '_open')).some(f => f.endsWith('.mp3')))
    const lyric = '[00:00.00]系统测试中文歌词\n[00:01.00]外部 LRC 验证'
    assert.equal((await post('/api/music/cache/lyric', { songInfo, lyricsObj: { lyric } })).status, 200)
    const tasks = [{ id: 'download_system', songInfo, quality: '320k', serverDownload: true, lyricMode: 'external' }]
    assert.equal((await post('/api/music/cache/queue', { tasks }, { 'Content-Type': 'application/json' })).status, 403)
    assert.equal((await post('/api/music/cache/queue', { tasks })).status, 200)
    let completed
    for (let i = 0; i < 100; i++) {
      const list = await (await fetch(origin + '/api/music/cache/queue', { headers: admin })).json()
      completed = list.data.find(t => t.id === 'download_system')
      if (['finished', 'exists', 'error'].includes(completed.status)) break
      await sleep(100)
    }
    assert.equal(completed.status, 'finished', completed.errorMsg + '\n' + logs.slice(-1500))
    assert.equal(completed.serverDownload, true)
    assert.ok(fs.readdirSync(directory).includes('系统测试歌曲 - 测试歌手 - 320k - Unknown Album.mp3'), '空模板沿用当前歌曲命名方式')
    assert.ok(fs.readdirSync(directory).some(f => f.endsWith('.lrc')))
    const checkUrl = '/api/music/server-download/check?source=wy&songmid=88888&quality=320k'
    const found = await (await fetch(origin + checkUrl)).json()
    assert.equal(found.exists, true)
    const count = audioRequests
    const playback = await fetch(origin + found.url, { headers: { Range: 'bytes=0-99' } })
    assert.equal(playback.status, 206)
    assert.equal((await playback.arrayBuffer()).byteLength, 100)
    assert.equal(audioRequests, count)
    assert.equal((await fetch(origin + found.url.replace('username=_open', 'username=other'))).status, 401)
    const storedLyric = await (await fetch(origin + '/api/music/lyric?source=wy&songmid=88888')).json()
    assert.equal(storedLyric.lyric, lyric)
    await stop(); await start()
    const restored = await (await fetch(origin + checkUrl)).json()
    assert.equal(restored.exists, true)
    const restoredDirs = await (await fetch(origin + '/api/music/cache/directories', { headers: admin })).json()
    assert.equal(restoredDirs.data.cacheDirectory, path.join(cacheDirectory, 'cache', '_open'))
    assert.equal((await post('/api/music/cache/queue', { tasks })).status, 200)
    await sleep(200)
    assert.equal(audioRequests, count)

    // 使用播放器实际续签及请求函数，复现服务重启导致登录 Token 失效。
    const store = new Map([['lx_sync_user', 'admin'], ['lx_sync_pass', 'lx-user-test'], ['lx_user_token', 'expired-before-restart'], ['lx_admin_password', 'lx-system-test']])
    const context = vm.createContext({ window: {}, console, fetch: (url, options) => fetch(origin + url, options),
      localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } })
    const frontend = fs.readFileSync(path.join(project, 'client/music/app.js'), 'utf8')
    const headersStart = frontend.indexOf('function getUserAuthHeaders()')
    vm.runInContext("let userToken = localStorage.getItem('lx_user_token');\n" + frontend.slice(headersStart, frontend.indexOf('window.getUserAuthHeaders = getUserAuthHeaders;', headersStart)), context)
    const refreshStart = frontend.indexOf('let userTokenRefreshPromise = null;')
    vm.runInContext(frontend.slice(refreshStart, frontend.indexOf('window.fetchDownloadWithAuth = fetchDownloadWithAuth;', refreshStart)), context)
    const namedTask = { ...tasks[0], id: 'named_download' }
    const expiredHeaders = { ...admin, 'x-user-name': 'admin', 'x-user-token': 'expired-before-restart' }
    assert.equal((await post('/api/music/cache/queue', { tasks: [namedTask] }, expiredHeaders)).status, 401)
    assert.equal((await context.fetchDownloadWithAuth('/api/music/cache/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: [namedTask] }) })).status, 200)
    assert.notEqual(store.get('lx_user_token'), 'expired-before-restart')
    for (let i = 0; i < 100; i++) {
      const response = await context.fetchDownloadWithAuth('/api/music/cache/queue')
      const list = await response.json()
      completed = list.data.find(t => t.id === 'named_download')
      if (['finished', 'exists', 'error'].includes(completed.status)) break
      await sleep(100)
    }
    assert.equal(completed.status, 'finished', completed.errorMsg + '\n' + logs.slice(-1500))
    const namedFound = await (await context.fetchDownloadWithAuth(checkUrl)).json()
    assert.equal(namedFound.exists, true)
    assert.ok(namedFound.url.includes('token='))
    const beforePlayback = audioRequests
    assert.equal((await fetch(origin + namedFound.url, { headers: { Range: 'bytes=0-99' } })).status, 206)
    const alice = await (await post('/api/user/login', { username: 'alice', password: 'lx-alice-test' })).json()
    assert.equal((await fetch(origin + namedFound.url, { headers: { 'x-user-name': 'alice', 'x-user-token': alice.token } })).status, 401)
    assert.equal(audioRequests, beforePlayback)

    const customDirectory = path.join(root, '用户自定义歌曲')
    const aliceDirectory = path.join(root, 'alice歌曲')
    const putUser = body => fetch(origin + '/api/users', { method: 'PUT', headers: admin, body: JSON.stringify(body) })
    assert.equal((await putUser({ name: 'admin', customMusicDir: '../bad', enableCustomMusicDir: true })).status, 422)
    let user = (await (await fetch(origin + '/api/users', { headers: admin })).json()).find(u => u.name === 'admin')
    assert.equal(user.enableCustomMusicDir, false)
    const dirsBatch = [{ name: 'admin', customMusicDir: customDirectory, enableCustomMusicDir: true }, { name: 'alice', customMusicDir: aliceDirectory, enableCustomMusicDir: true }]
    assert.equal((await post('/api/config', { 'user.enableCustomMusicDir': true, 'download.nameTemplate': '{title}', 'user.customMusicDirectories': [dirsBatch[0], { ...dirsBatch[1], customMusicDir: '../bad' }] })).status, 400)
    user = (await (await fetch(origin + '/api/users', { headers: admin })).json()).find(u => u.name === 'admin')
    assert.equal(user.enableCustomMusicDir, false, '第二个目录非法时第一个用户配置也不能修改')
    assert.equal((await (await fetch(origin + '/api/config', { headers: admin })).json())['download.nameTemplate'], '')
    assert.equal((await post('/api/config', { 'user.enableCustomMusicDir': true, 'download.nameTemplate': '{artist} - {title}', 'user.customMusicDirectories': dirsBatch })).status, 200)
    fs.writeFileSync(path.join(customDirectory, '测试歌曲.mp3'), audio)
    user = (await (await fetch(origin + '/api/users', { headers: admin })).json()).find(u => u.name === 'admin')
    assert.equal(user.customMusicDir, customDirectory)
    assert.equal(user.password, 'lx-user-test')
    assert.equal(user.allowWriteCustomMusicDir, true)
    await stop(); await start()
    const afterRestart = await (await context.fetchDownloadWithAuth(checkUrl)).json()
    assert.equal(afterRestart.exists, true)
    assert.equal((await fetch(origin + afterRestart.url)).status, 200)
    user = (await (await fetch(origin + '/api/users', { headers: admin })).json()).find(u => u.name === 'admin')
    assert.equal(user.customMusicDir, customDirectory)
    assert.equal(user.enableCustomMusicDir, true)
    const restoredCfg = await (await fetch(origin + '/api/config', { headers: admin })).json()
    assert.equal(restoredCfg['download.nameTemplate'], '{artist} - {title}')
    assert.equal(restoredCfg['update.enabled'], false)
    assert.equal(restoredCfg['update.server'], updateServer)
    assert.equal(restoredCfg['update.hasToken'], true, '空输入应保留已经保存的令牌')
    assert.equal((await post('/api/config', { 'update.clearToken': true })).status, 200)
    assert.equal((await (await fetch(origin + '/api/config', { headers: admin })).json())['update.hasToken'], false)
    const restoredAlice = (await (await fetch(origin + '/api/users', { headers: admin })).json()).find(u => u.name === 'alice')
    assert.equal(restoredAlice.customMusicDir, aliceDirectory)
    const customList = await (await context.fetchDownloadWithAuth('/api/music/custom/list')).json()
    assert.equal(customList.success, true)
    assert.ok(customList.data.some(song => song.filename === '测试歌曲.mp3'), '播放器应读取后台保存的用户歌曲目录')
    assert.equal(audioRequests, beforePlayback)
  } finally {
    await stop()
    await new Promise(resolve => sourceServer.close(resolve))
    assert.ok(root.startsWith(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
