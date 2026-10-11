/** 从真实 Windows 桌面包启动独立两端，验证 Node SQLite、窗口资源和粉色默认主题。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '..');
const serverDirectory = path.join(root, 'dist-electron/server/win-unpacked');
const clientDirectory = path.join(root, 'dist-electron/client/win-unpacked');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @returns {Promise<number>} 操作系统分配的测试端口。 */
async function freePort() { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p; }

test('Windows 独立桌面程序可协同运行，客户端窗口使用打包资源，后端写入独立两库', { timeout: 90000, skip: process.platform !== 'win32' || !fs.existsSync(path.join(serverDirectory, '洛洛雪音乐服务端.exe')) || !fs.existsSync(path.join(clientDirectory, '洛洛雪音乐客户端.exe')) }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-desktop-system-'));
  const children = []; let logs = '';
  const launch = (directory, name, args, env) => {
    const child = spawn(path.join(directory, name), args, { cwd: directory, windowsHide: true, env: { ...process.env, ...env, DISABLE_TELEMETRY: 'true' } });
    children.push(child); child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; }); return child;
  };
  const wait = async (url, child) => {
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error('桌面程序退出：' + logs.slice(-2500));
      try { const response = await fetch(url, { headers: { 'x-frontend-auth': 'desktop-test' }, signal: AbortSignal.timeout(1000) }); if (response.ok) return response; } catch {}
      await delay(100);
    }
    throw new Error('桌面程序启动超时：' + logs.slice(-2500));
  };
  let socket;
  try {
    const backend = path.join(serverDirectory, 'resources/backend');
    assert.equal(fs.existsSync(path.join(backend, 'client/index.html')), false);
    assert.equal(fs.existsSync(path.join(clientDirectory, 'resources/backend/dist/server')), false);
    const port = await freePort(), clientPort = await freePort(), debugPort = await freePort();
    const config = path.join(temp, 'config.js');
    fs.writeFileSync(config, `module.exports={'client.serverUrl':'http://127.0.0.1:${port}','client.port':${clientPort},'client.bindIP':'127.0.0.1'};`);
    const data = path.join(temp, 'data');
    const server = launch(serverDirectory, '洛洛雪音乐服务端.exe', [`--user-data-dir=${path.join(temp, 'server-profile')}`], { CONFIG_PATH: config, DATA_PATH: data, LOG_PATH: path.join(temp, 'logs'), PORT: String(port), FRONTEND_PASSWORD: 'desktop-test' });
    await wait(`http://127.0.0.1:${port}/api/config`, server);
    const client = launch(clientDirectory, '洛洛雪音乐客户端.exe', [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'client-profile')}`], { CLIENT_CONFIG_PATH: config });
    const origin = `http://127.0.0.1:${clientPort}`;
    await wait(origin + '/api/config', client);
    assert.ok((await (await fetch(origin + '/')).text()).includes('洛洛雪音乐'));
    assert.ok((await (await fetch(origin + '/music/assets/logo.svg')).text()).includes('#ec4899'));
    const db = new Database(path.join(data, 'database/admin.sqlite'), { readonly: true });
    // 已生成的桌面包可能早于源码表名前缀调整；此测试只验证该包自身运行能力。
    try {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('server_config', 'admin_config') ORDER BY name DESC").get()?.name;
      assert.ok(table);
      assert.ok(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n > 0);
    } finally { db.close(); }
    assert.equal(fs.existsSync(path.join(data, 'database/music.sqlite')), true);
    const targets = await (await wait(`http://127.0.0.1:${debugPort}/json/list`, client)).json();
    const page = targets.find(target => target.type === 'page'); assert.ok(page);
    socket = new WebSocket(page.webSocketDebuggerUrl); await once(socket, 'open');
    let nextId = 0;
    const evaluate = expression => new Promise((resolve, reject) => {
      const id = ++nextId;
      const listener = raw => { const message = JSON.parse(raw); if (message.id !== id) return; socket.off('message', listener); if (message.error) reject(new Error(message.error.message)); else resolve(message.result.result.value); };
      socket.on('message', listener); socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
    let state;
    for (let i = 0; i < 60; i++) {
      state = await evaluate("({title:document.title,theme:document.documentElement.dataset.theme,logo:[...document.images].some(i=>i.src.includes('logo.svg')&&i.complete&&i.naturalWidth>0)})");
      if (state?.theme === 'pink' && state.logo) break;
      await delay(100);
    }
    assert.equal(state.title, '洛洛雪音乐'); assert.equal(state.theme, 'pink'); assert.equal(state.logo, true);
    console.log('真实桌面窗口验证：', state);
  } finally {
    socket?.terminate();
    // 只结束本测试创建的进程树，包含 Electron 渲染进程与随包 Node 后端。
    for (const child of children.reverse()) if (child.exitCode === null) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await delay(500);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Windows 整体桌面包使用外部临时配置与本地资源，HTTP 页面可运行', { timeout: 60000, skip: process.platform !== 'win32' || !fs.existsSync(path.join(root, 'dist-electron/all/win-unpacked/洛洛雪音乐.exe')) }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-desktop-all-'));
  const directory = path.join(root, 'dist-electron/all/win-unpacked');
  const port = await freePort(); let logs = '';
  fs.writeFileSync(path.join(temp, 'config.js'), 'module.exports={};');
  const child = spawn(path.join(directory, '洛洛雪音乐.exe'), [`--user-data-dir=${path.join(temp, 'profile')}`], { cwd: directory, windowsHide: true, env: { ...process.env, CONFIG_PATH: path.join(temp, 'config.js'), DATA_PATH: path.join(temp, 'data'), LOG_PATH: path.join(temp, 'logs'), PORT: String(port), FRONTEND_PASSWORD: 'all-desktop-test', DISABLE_TELEMETRY: 'true' } });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  try {
    let response;
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error(logs.slice(-2500));
      try { response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch {}
      await delay(100);
    }
    assert.ok(response?.ok, logs.slice(-2500));
    assert.equal(response.headers.get('x-llx-client-asset'), null);
    assert.ok((await response.text()).includes('洛洛雪音乐'));
    const logo = await fetch(`http://127.0.0.1:${port}/music/assets/logo.svg`);
    assert.equal(logo.status, 200); assert.ok((await logo.text()).includes('#ec4899'));
    assert.equal(fs.existsSync(path.join(temp, 'data/database/admin.sqlite')), true);
  } finally {
    if (child.exitCode === null) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await delay(500); fs.rmSync(temp, { recursive: true, force: true });
  }
});
