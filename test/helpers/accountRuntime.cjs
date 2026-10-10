/** 隔离的账号系统测试服务，使用源码和真实 SQLite，不读取现有数据目录。 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http')
const { spawn } = require('node:child_process')
const project = path.resolve(__dirname, '../..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function startAccountRuntime(configuration = {}, prepare, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-account-system-'))
  const initialConfig = 'module.exports=' + JSON.stringify({ 'player.enableAuth': true, 'auth.sessionDays': 1, 'auth.rememberMeDays': 30, 'admin.path': '/admin', 'player.path': '/', users: [{ name: 'alice', password: 'alice123' }, { name: 'bob', password: 'bob12345' }], ...configuration })
  fs.writeFileSync(path.join(root, 'config.js'), initialConfig)
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const origin = 'http://127.0.0.1:' + port, admin = { 'x-frontend-auth': 'account-test' }
  let child, logs = ''
  const start = async () => {
    const setup = 'require(' + JSON.stringify(path.join(project,'server/modules/utils/musicSdk/index.js')) + ').default.init=async()=>{};require(' + JSON.stringify(path.join(project,'server/index.ts')) + ');'
    child = spawn(process.execPath, ['-r', 'tsx/cjs', '-e', setup], { cwd: root, windowsHide:true, env: { ...process.env, NODE_PATH:path.join(project,'node_modules'), CONFIG_PATH:path.join(root,'config.js'), DATA_PATH:path.join(root,'data'), LOG_PATH:path.join(root,'logs'), STATIC_PATH:path.join(project,'client'), PORT:String(port), FRONTEND_PASSWORD:'account-test', DISABLE_TELEMETRY:'true', NODE_ENV:'test' } })
    child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
    for (let i=0;i<180;i++) {
      if (child.exitCode !== null) throw new Error('启动失败：' + logs.slice(-4000))
      try {
        const response = await fetch(origin + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:'account-test'}) })
        if (response.ok) { admin['x-admin-token'] = (await response.json()).token; return }
      } catch {}
      await sleep(100)
    }
    throw new Error('启动超时：' + logs.slice(-4000))
  }
  const stopProcess = async () => { if (child && child.exitCode === null) { const done = new Promise(resolve => child.once('exit',resolve)); child.kill(); await done } }
  const stop = async () => { await stopProcess(); fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}) }
  const restart = async () => { await stopProcess(); await start() }
  try {
    if (prepare) await prepare(root)
    await start()
    if (options.importConfig !== false) {
      const response = await fetch(origin + '/api/config/import', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: initialConfig }) })
      if (!response.ok) throw new Error('测试账号初始化失败：' + await response.text())
    }
    return { root,origin,admin,stop,restart }
  } catch (error) { await stop(); throw error }
}
module.exports = { startAccountRuntime }
if (require.main === module) startAccountRuntime().then(runtime => { console.log(runtime.origin); process.on('SIGINT', async () => { await runtime.stop(); process.exit(0) }); process.on('SIGTERM', async () => { await runtime.stop(); process.exit(0) }) }).catch(error => { console.error(error); process.exitCode=1 })
