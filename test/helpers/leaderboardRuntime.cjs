/** 排行榜测试实例，真实服务与静态资源使用当前源码，外部音源使用固定数据。 @author jingyh @date 2026-10-10 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http')
const { spawn } = require('node:child_process')
const project = path.resolve(__dirname, '../..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** 启动隔离实例，不访问现有数据目录；返回地址与关闭方法供 HTTP 和浏览器测试使用。 */
async function startLeaderboardRuntime(prepare) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-leaderboard-system-'))
  if (prepare) await prepare(root)
  const probe = http.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const setup = `
    const sdk = require(${JSON.stringify(path.join(project, 'server/modules/utils/musicSdk/index.js'))}).default;
    sdk.init = async () => {};
    for (const source of ['wy', 'tx', 'kg', 'kw', 'mg']) {
      sdk[source].leaderboard.getBoards = async () => ({ list: Array.from({ length: 45 }, (_, i) => ({ bangid: 'board-' + i, name: i === 0 ? '测试热歌榜' : '测试榜单 ' + (i + 1) })) });
      sdk[source].leaderboard.getList = async (bangid, page) => ({ total: 80, limit: 100, page, list: Array.from({ length: 80 }, (_, i) => ({ id: source + '_' + bangid + '_' + i, songmid: bangid + '_' + i, name: '测试歌曲 ' + (i + 1), singer: '测试歌手', albumName: '测试专辑', interval: '03:30', source, img: '/assets/logo.svg', types: [], _types: {} })) });
    }
    require(${JSON.stringify(path.join(project, 'server/index.ts'))});
  `
  let logs = ''
  const child = spawn(process.execPath, ['-r', 'tsx/cjs', '-e', setup], { cwd: root, windowsHide: true, env: { ...process.env, NODE_PATH: path.join(project, 'node_modules'), CONFIG_PATH: path.join(root, 'config.js'), DATA_PATH: path.join(root, 'data'), LOG_PATH: path.join(root, 'logs'), STATIC_PATH: path.join(project, 'client'), PORT: String(port), CLIENT_MODE: 'local', FRONTEND_PASSWORD: 'leaderboard-test', DISABLE_TELEMETRY: 'true', NODE_ENV: 'test' } })
  child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
  const stop = async () => {
    if (child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  const origin = `http://127.0.0.1:${port}`
  try {
    for (let i = 0; i < 180; i++) {
      if (child.exitCode !== null) throw new Error('测试实例启动失败：' + logs.slice(-2000))
      try { const adminLogin = await fetch(origin + '/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'leaderboard-test'})}); if (adminLogin.ok) {
        const adminToken = (await adminLogin.json()).token;
        const imported = await fetch(origin + '/api/config/import', { method: 'POST', headers: { 'x-frontend-auth': 'leaderboard-test', 'x-admin-token': adminToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: "module.exports={users:[{name:'test',password:'leaderboard123'}]}" }) })
        if (!imported.ok) throw new Error('测试账号初始化失败')
        const response = await fetch(origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test', password: 'leaderboard123' }) })
        const account = await response.json()
        return { origin, stop, headers: { cookie: response.headers.get('set-cookie').split(';')[0], 'x-user-token': account.token } }
      } } catch {}
      await sleep(100)
    }
    throw new Error('测试实例启动超时：' + logs.slice(-2000))
  } catch (error) { await stop(); throw error }
}

module.exports = { startLeaderboardRuntime }
if (require.main === module) {
  startLeaderboardRuntime().then(runtime => {
    console.log('排行榜隔离测试地址：' + runtime.origin)
    process.on('SIGINT', async () => { await runtime.stop(); process.exit(0) })
    process.on('SIGTERM', async () => { await runtime.stop(); process.exit(0) })
  }).catch(error => { console.error(error); process.exitCode = 1 })
}
