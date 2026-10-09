/** 对真实 FPK 校验源码一致性，并隔离安装生产依赖后启动服务。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { entries, validateArchive } = require('../scripts/fpk-archive');
const root = path.resolve(__dirname, '../..');
const version = require(path.join(root, 'package.json')).version;
const file = path.join(root, `fnos/dist/levis.lxserver-v${version}.fpk`);

/** 返回包内应用相对路径，复用归档解析器的路径校验。 */
function readPackage() {
  const bytes = fs.readFileSync(file);
  const archive = entries(zlib.gunzipSync(bytes));
  const payload = entries(zlib.gunzipSync(archive.find(e => e.filename === 'app.tgz').content));
  const app = new Map();
  for (const entry of payload) {
    const match = entry.filename.match(/^(?:\.\/)?(?:app\/)?server\/(.+)$/);
    if (match && entry.header[156] !== 53) app.set(match[1], entry.content);
  }
  return { bytes, archive, app };
}

test('真实 FPK：版本、归档权限、锁文件和当前源码逐字节一致', () => {
  const { bytes, archive, app } = readPackage();
  validateArchive(bytes);
  assert.match(archive.find(e => e.filename === 'manifest').content.toString(), new RegExp(`^version\\s*=\\s*${version.replaceAll('.', '\\.')}$`, 'm'));
  assert.equal(JSON.parse(app.get('package.json')).version, version);
  assert.equal(JSON.parse(app.get('package-lock.json')).packages[''].version, version);
  assert.deepEqual(app.get('index.js'), fs.readFileSync(path.join(root, 'index.js')));
  for (const [name, content] of app) {
    if (name.startsWith('server/') || name.startsWith('public/')) assert.deepEqual(content, fs.readFileSync(path.join(root, name)), name);
    assert.equal(name.includes('node_modules/') || name.startsWith('data/'), false);
  }
  assert.ok(app.has('server/server/serverDownloads.js'));
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
    const install = spawn(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
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
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    // 只跳过公网音源预热；实际编译入口、依赖、配置及静态服务均来自安装包。
    const bootstrap = `require('./server/modules/utils/musicSdk/index.js').default.init = async () => {}; require('./index.js');`;
    child = spawn(process.execPath, ['-e', bootstrap], { cwd: application, windowsHide: true, env: {
      ...process.env, NODE_ENV: 'production', PORT: String(port), BIND_IP: '127.0.0.1',
      CONFIG_PATH: config, DATA_PATH: path.join(temp, 'data'), LOG_PATH: path.join(temp, 'logs'),
      STATIC_PATH: path.join(application, 'public'), DISABLE_TELEMETRY: 'true',
    } });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, output.slice(-2500));
      try {
        const response = await fetch(origin + '/api/config', { headers: { 'x-frontend-auth': 'fpk-system-test' } });
        if (response.ok) { ready = true; break; }
      } catch {}
      await wait(100);
    }
    assert.equal(ready, true, output.slice(-2500));
    assert.equal((await fetch(origin + '/music')).status, 200);
    assert.equal((await fetch(origin + '/admin')).status, 200);
    const updates = await (await fetch(origin + '/api/app/update/check')).json();
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
