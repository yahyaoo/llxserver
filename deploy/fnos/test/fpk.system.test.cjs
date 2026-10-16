/** 对真实 FPK 校验源码一致性，并隔离安装生产依赖后启动服务。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { entries, validateArchive } = require('../scripts/fpk-archive');
const root = path.resolve(__dirname, '../../..');
const version = require(path.join(root, 'package.json')).version;
const file = path.join(root, `deploy/fnos/dist/llxserver.all-v${version}.fpk`);

/** 返回包内应用相对路径，复用归档解析器的路径校验。 */
function readPackage(mode = 'all') {
  const filename = mode === 'all' ? file : path.join(root, `deploy/fnos/dist/llxserver.${mode}-v${version}.fpk`);
  const bytes = fs.readFileSync(filename);
  const archive = entries(zlib.gunzipSync(bytes));
  const payload = entries(zlib.gunzipSync(archive.find(e => e.filename === 'app.tgz').content));
  const app = new Map();
  for (const entry of payload) {
    const match = entry.filename.match(/^(?:\.\/)?(?:app\/)?server\/(.+)$/);
    if (match && entry.header[156] !== 53) app.set(match[1], entry.content);
  }
  return { bytes, archive, app };
}

test('独立飞牛 FPK：两个实际载荷协同运行，客户端无服务代码和 Node 依赖', { timeout: 120000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-fpk-split-'));
  const children = []; let logs = '';
  try {
    for (const mode of ['server', 'client']) {
      const { bytes, app } = readPackage(mode); validateArchive(bytes, mode);
      for (const [name, content] of app) { const filename = path.join(temp, mode, name); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content); }
    }
    const serverRoot = path.join(temp, 'server'), clientRoot = path.join(temp, 'client');
    assert.equal(fs.existsSync(path.join(serverRoot, 'client/index.html')), false);
    assert.equal(fs.existsSync(path.join(clientRoot, 'dist/server')), false);
    assert.equal(fs.existsSync(path.join(clientRoot, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(clientRoot, 'server/application/http/StaticDelivery.js')), true);
    // 复用当前锁定的本机生产依赖，两个角色均只从已解压的安装包加载应用文件。
    for (const [relative, item] of Object.entries(require(path.join(root, 'package-lock.json')).packages)) if (relative.startsWith('node_modules/') && !item.dev && fs.existsSync(path.join(root, relative))) fs.cpSync(path.join(root, relative), path.join(serverRoot, relative), { recursive: true });
    async function port() { const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const p = probe.address().port; await new Promise(resolve => probe.close(resolve)); return p; }
    const serverPort = await port(), clientPort = await port();
    const serverOrigin = `http://127.0.0.1:${serverPort}`, origin = `http://127.0.0.1:${clientPort}`;
    fs.writeFileSync(path.join(clientRoot, 'config.js'), `module.exports={'client.serverUrl':'${serverOrigin}','client.port':${clientPort},'client.bindIP':'127.0.0.1'}`);
    const start = (cwd, args, env) => { const child = spawn(process.execPath, args, { cwd, windowsHide: true, env: { ...process.env, ...env, DISABLE_TELEMETRY: 'true' } }); children.push(child); child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; }); return child; };
    start(serverRoot, ['-e', "require('./dist/server/modules/utils/musicSdk/index.js').default.init=async()=>{};require('./index.js')"], { CONFIG_PATH: path.join(serverRoot, 'config.js'), PORT: String(serverPort), DATA_PATH: path.join(temp, 'data'), LOG_PATH: path.join(temp, 'logs'), FRONTEND_PASSWORD: 'fpk-split-test' });
    start(clientRoot, ['deploy/client/gateway.cjs'], { CONFIG_PATH: path.join(clientRoot, 'config.js') });
    let ready = false, adminToken;
    for (let i = 0; i < 100; i++) { try { const response = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'fpk-split-test' }) }); if (response.ok) { adminToken = (await response.json()).token; ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(ready, logs.slice(-2500));
    const admin = { 'content-type': 'application/json', 'x-frontend-auth': 'fpk-split-test', 'x-admin-token': adminToken };
    assert.equal((await fetch(origin + '/api/config', { headers: admin })).status, 200);
    assert.equal((await fetch(origin + '/api/config/import', { method: 'POST', headers: admin, body: JSON.stringify({ content: "module.exports={users:[{name:'fpk-user',password:'fpk-player-test'}]}" }) })).status, 200);
    const login = await fetch(origin + '/api/user/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'fpk-user', password: 'fpk-player-test' }) });
    assert.equal(login.status, 200); const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    assert.equal((await fetch(origin + '/', { redirect: 'manual' })).status, 302);
    assert.ok((await (await fetch(origin + '/', { headers })).text()).includes('洛洛雪音乐'));
    assert.equal((await fetch(origin + '/admin/')).status, 200);
    assert.ok((await (await fetch(origin + '/music/assets/logo.svg', { headers })).text()).includes('洛洛雪音乐'));
  } finally {
    for (const child of children) if (child.exitCode === null) { const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped; }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('真实 FPK：版本、归档权限、锁文件和当前源码逐字节一致', () => {
  const { bytes, archive, app } = readPackage();
  validateArchive(bytes);
  assert.match(archive.find(e => e.filename === 'manifest').content.toString(), new RegExp(`^version\\s*=\\s*${version.replaceAll('.', '\\.')}$`, 'm'));
  assert.equal(JSON.parse(app.get('package.json')).version, version);
  assert.equal(JSON.parse(app.get('package-lock.json')).packages[''].version, version);
  assert.deepEqual(app.get('index.js'), fs.readFileSync(path.join(root, 'index.js')));
  for (const [name, content] of app) {
    if (name.startsWith('dist/server/') || name.startsWith('client/') || name.startsWith('deploy/node/')) assert.deepEqual(content, fs.readFileSync(path.join(root, name.startsWith('client/') ? 'dist/' + name : name)), name);
    assert.equal(name.includes('node_modules/') || name.startsWith('data/'), false);
  }
  assert.ok(app.has('dist/server/server/serverDownloads.js'));
  assert.equal(app.get('config.js').toString().includes('module.exports = {};'), true);
  const checksum = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  assert.equal(fs.readFileSync(file + '.sha256', 'utf8').split(/\s/)[0], checksum);
});

test('真实载荷：隔离安装锁定生产依赖并启动 HTTP 服务', { timeout: 120000 }, async () => {
  const { app } = readPackage();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-fpk-system-'));
  let child, output = '';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    const application = path.join(temp, 'application');
    for (const [name, content] of app) {
      const destination = path.join(application, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    }
    assert.ok(process.env.npm_execpath, '通过 npm run test:fpk:system 执行');
    const install = spawn(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: application, windowsHide: true,
    });
    install.stdout.on('data', chunk => { output += chunk; });
    install.stderr.on('data', chunk => { output += chunk; });
    const installExit = await new Promise((resolve, reject) => { install.once('exit', resolve); install.once('error', reject); });
    assert.equal(installExit, 0, output.slice(-2500));
    const config = path.join(temp, 'config.js');
    fs.writeFileSync(config, 'module.exports = ' + JSON.stringify({
      'frontend.password': 'fpk-system-test', 'admin.path': '/admin', 'player.path': '/music',
      'player.enableAuth': false, disableTelemetry: true, 'configBackup.enable': false, users: [],
    }));
    const initialize = spawn(process.execPath, ['dist/server/application/persistence/InstallationConfiguration.js'], { cwd: application, windowsHide: true, env: { ...process.env, CONFIG_PATH: config, DATA_PATH: path.join(temp, 'data') } });
    initialize.stderr.on('data', chunk => { output += chunk; });
    assert.equal(await new Promise(resolve => initialize.once('exit', resolve)), 0, output.slice(-2500));
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    // 只跳过公网音源预热；实际编译入口、依赖、配置及静态服务均来自安装包。
    const bootstrap = `require('./dist/server/modules/utils/musicSdk/index.js').default.init = async () => {}; require('./index.js');`;
    child = spawn(process.execPath, ['-e', bootstrap], { cwd: application, windowsHide: true, env: {
      ...process.env, NODE_ENV: 'production', PORT: String(port), BIND_IP: '127.0.0.1',
      CONFIG_PATH: config, DATA_PATH: path.join(temp, 'data'), LOG_PATH: path.join(temp, 'logs'),
      STATIC_PATH: path.join(application, 'client'), DISABLE_TELEMETRY: 'true',
      ENABLE_WEBPLAYER_AUTH: 'false',
    } });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false, adminToken;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, output.slice(-2500));
      try {
        const response = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: '123456' }) });
        if (response.ok) { adminToken = (await response.json()).token; ready = true; break; }
      } catch {}
      await wait(100);
    }
    assert.equal(ready, true, output.slice(-2500));
    // 在导入测试账号前验证安装包自带默认账号，防止再次交付无法登录的安装包。作者：jingyh
    const defaultLogin = await fetch(origin + '/api/user/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456' }) });
    assert.equal(defaultLogin.status, 200);
    const admin = { 'content-type': 'application/json', 'x-frontend-auth': '123456', 'x-admin-token': adminToken };
    assert.equal((await fetch(origin + '/api/config', { headers: admin })).status, 200);
    assert.equal((await fetch(origin + '/api/config/import', { method: 'POST', headers: admin, body: JSON.stringify({ content: "module.exports={users:[{name:'fpk-user',password:'fpk-player-test'}],'player.path':'/music'}" }) })).status, 200);
    assert.equal((await fetch(origin + '/music', { redirect: 'manual' })).status, 302);
    const login = await fetch(origin + '/api/user/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'fpk-user', password: 'fpk-player-test' }) });
    assert.equal(login.status, 200); const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    assert.equal((await fetch(origin + '/music', { headers })).status, 200);
    assert.equal((await fetch(origin + '/admin')).status, 200);
    const updates = await (await fetch(origin + '/api/app/update/check', { headers: admin })).json();
    assert.equal(updates.currentVersion, version);
    assert.equal(updates.enabled, false);
  } finally {
    if (child && child.exitCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await stopped;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
