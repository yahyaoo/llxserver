/** 解压实际 ZIP 并从交付目录启动，验证整体与服务端、客户端分离部署。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const unzipper = require('unzipper');
const Database = require('better-sqlite3');
const { packageApplication } = require('../deploy/scripts/package.cjs');
const project = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @returns {Promise<number>} 操作系统分配的可用测试端口。 */
async function freePort() { const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
/** 复制当前锁文件的生产依赖，使临时应用可离线启动，不引用源码或开发依赖。 */
function copyProductionDependencies(destination) {
  const lock = require('../package-lock.json');
  for (const [relative, item] of Object.entries(lock.packages)) {
    if (!relative.startsWith('node_modules/') || item.dev || !fs.existsSync(path.join(project, relative))) continue;
    fs.cpSync(path.join(project, relative), path.join(destination, relative), { recursive: true });
  }
  assert.ok(require.resolve('better-sqlite3', { paths: [destination] }).startsWith(destination + path.sep));
}

test('实际整体 ZIP 和两个独立 ZIP 均可启动，鉴权、配置、资源及 SQL 持久化保持一致', { timeout: 180000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-package-system-'));
  const processes = [];
  let logs = '';
  const launch = (cwd, script, env) => {
    const child = spawn(process.execPath, script, { cwd, windowsHide: true, env: { ...process.env, CLIENT_MODE: '', ...env, DISABLE_TELEMETRY: 'true', NODE_ENV: 'production' } });
    processes.push(child); child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; }); return child;
  };
  const wait = async (origin, child) => {
    for (let i = 0; i < 120; i++) { if (child.exitCode !== null) throw new Error(logs.slice(-3000)); try {
      const response = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'package-test' }) });
      if (response.ok) { const admin = { 'content-type': 'application/json', 'x-frontend-auth': 'package-test', 'x-admin-token': (await response.json()).token }; assert.equal((await fetch(origin + '/api/config', { headers: admin })).status, 200); return admin; }
    } catch {} await delay(100); }
    throw new Error('交付包启动超时：' + logs.slice(-3000));
  };
  try {
    for (const mode of ['all', 'server', 'client']) {
      const zip = await packageApplication(mode); const archive = await unzipper.Open.file(zip);
      await archive.extract({ path: temp });
    }
    const standaloneServer = path.join(temp, 'llxserver-server'), standaloneClient = path.join(temp, 'llxserver-client'), all = path.join(temp, 'llxserver-all');
    assert.equal(fs.existsSync(path.join(standaloneServer, 'client/index.html')), false);
    assert.equal(fs.existsSync(path.join(standaloneClient, 'dist/server')), false);
    assert.equal(fs.existsSync(path.join(standaloneClient, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(standaloneServer, 'server')), false);
    copyProductionDependencies(standaloneServer); copyProductionDependencies(all);
    const setup = "require('./dist/server/modules/utils/musicSdk/index.js').default.init=async()=>{};require('./index.js');";
    const backendPort = await freePort(), clientPort = await freePort(), allPort = await freePort();
    const data = path.join(temp, 'split-data'), config = path.join(standaloneServer, 'config.js');
    const common = { DATA_PATH: data, LOG_PATH: path.join(temp, 'logs'), CONFIG_PATH: config, FRONTEND_PASSWORD: 'package-test', ENABLE_WEBPLAYER_AUTH: 'true', WEBPLAYER_PASSWORD: 'player-test' };
    const backend = launch(standaloneServer, ['-e', setup], { ...common, PORT: String(backendPort), CLIENT_MODE: 'external' });
    const backendOrigin = `http://127.0.0.1:${backendPort}`; const admin = await wait(backendOrigin, backend);
    const accountConfig = { content: "module.exports={users:[{name:'package-user',password:'player-test'}],'player.path':'/'}" };
    assert.equal((await fetch(backendOrigin + '/api/config/import', { method: 'POST', headers: admin, body: JSON.stringify(accountConfig) })).status, 200);
    // 地址与监听端口只来自独立客户端 config.js，证明无需源码和环境变量也可连接后端。
    fs.writeFileSync(path.join(standaloneClient, 'config.js'), `module.exports={'client.serverUrl':'${backendOrigin}','client.port':${clientPort},'client.bindIP':'127.0.0.1'}`);
    const client = launch(standaloneClient, ['deploy/client/gateway.cjs'], { CONFIG_PATH: path.join(standaloneClient, 'config.js') });
    const origin = `http://127.0.0.1:${clientPort}`; await wait(origin, client);
    const unauthorized = await fetch(origin + '/', { redirect: 'manual' }); assert.equal(unauthorized.status, 302); assert.equal(unauthorized.headers.get('location'), '/login');
    assert.ok((await (await fetch(origin + '/login')).text()).includes('洛洛雪音乐'));
    assert.equal((await fetch(origin + '/api/config')).status, 401);
    const login = await fetch(origin + '/api/user/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'package-user', password: 'player-test' }) });
    assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(origin + '/', { headers: { Cookie: cookie } }); assert.equal(page.status, 200); assert.ok((await page.text()).includes('洛洛雪音乐'));
    assert.equal((await fetch(origin + '/admin/')).status, 200);
    for (const resource of ['/music/assets/logo.svg', '/music/views/settings/SettingsView.js', '/js/config.js']) { const response = await fetch(origin + resource, { headers: { Cookie: cookie } }); assert.equal(response.status, 200, resource); assert.ok((await response.text()).length > 50); assert.equal(response.headers.get('x-llx-client-asset'), null); }
    const manifest = await (await fetch(origin + '/manifest.json')).json(); assert.equal(manifest.name, '洛洛雪音乐'); assert.equal(manifest.scope, '/');
    assert.equal((await fetch(origin + '/api/config', { method: 'POST', headers: admin, body: JSON.stringify({ serverName: '独立部署测试', 'player.path': '/listen' }) })).status, 200);
    const dynamic = await (await fetch(origin + '/js/config.js')).text(); assert.ok(dynamic.includes('独立部署测试')); assert.ok(dynamic.includes('/listen'));
    assert.equal((await fetch(origin + '/listen/', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await (await fetch(origin + '/listen/manifest.json')).json()).scope, '/listen/');
    const db = new Database(path.join(data, 'database/admin.sqlite'), { readonly: true }); assert.ok(db.prepare('SELECT COUNT(*) AS n FROM server_config').get().n > 0); db.close();
    assert.equal(fs.existsSync(path.join(data, 'database/music.sqlite')), true);
    const combined = launch(all, ['-e', setup], { PORT: String(allPort), DATA_PATH: path.join(temp, 'all-data'), CONFIG_PATH: path.join(all, 'config.js'), LOG_PATH: path.join(temp, 'all-logs'), FRONTEND_PASSWORD: 'package-test', CLIENT_MODE: 'local' });
    const combinedOrigin = `http://127.0.0.1:${allPort}`; const combinedAdmin = await wait(combinedOrigin, combined);
    assert.equal((await fetch(combinedOrigin + '/api/config/import', { method: 'POST', headers: combinedAdmin, body: JSON.stringify(accountConfig) })).status, 200);
    assert.equal((await fetch(combinedOrigin + '/', { redirect: 'manual' })).status, 302);
    const combinedLogin = await fetch(combinedOrigin + '/api/user/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'package-user', password: 'player-test' }) });
    assert.equal(combinedLogin.status, 200); const combinedCookie = combinedLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(combinedOrigin + '/', { headers: { Cookie: combinedCookie } })).status, 200); assert.equal((await fetch(combinedOrigin + '/admin/')).status, 200);
    assert.ok((await (await fetch(combinedOrigin + '/music/assets/logo.svg', { headers: { Cookie: combinedCookie } })).text()).includes('洛洛雪音乐'));
  } finally {
    for (const child of processes) if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
