/**
 * 在隔离 Electron 生命周期中验证独立两端的配置、资源定位及异常退出。
 * 使用真实客户端配置加载器，避免测试替身掩盖环境变量优先级问题。
 * @author yahyaoo
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { loadClientConfiguration } = require('../deploy/client/gateway.cjs');

test('桌面交付目录保留主页与仓库元数据，单架构构建只传入指定架构', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-desktop-package-'));
  const commands = [];
  const source = path.join(root, 'output/llxserver-client');
  const metadata = { version: '2.1.3', description: '桌面测试', author: { name: 'yahyaoo' }, license: 'Apache-2.0', homepage: 'https://github.com/yahyaoo/llxserver', repository: { type: 'git', url: 'git+https://github.com/yahyaoo/llxserver.git' } };
  try {
    for (const relative of ['deploy/desktop', 'output/llxserver-client/client', 'output/llxserver-client/deploy/client']) fs.mkdirSync(path.join(root, relative), { recursive: true });
    fs.writeFileSync(path.join(source, 'config.js'), 'module.exports={}');
    const sandbox = { exports: {}, module: { exports: {} }, __dirname: path.join(root, 'deploy/scripts'), process, console, require: name => {
      if (name === 'node:child_process') return { execFileSync: (command, args) => commands.push({ command, args }) };
      if (name === './package.cjs') return { packageApplication: async mode => { assert.equal(mode, 'client'); } };
      if (name === './node-runtime.cjs') return { version: '22.22.3', prepareNodeRuntime: () => { throw new Error('客户端不得准备后端运行时'); } };
      if (name === path.join(root, 'package.json')) return metadata;
      if (name === path.join(root, 'node_modules/electron/package.json')) return { version: '43.7.5' };
      return require(name);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../deploy/scripts/desktop.cjs'), 'utf8'), sandbox);
    await sandbox.module.exports.buildDesktop('client', ['--win', '--x64']);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'output/desktop-client-win32-x64/package.json'), 'utf8'));
    assert.equal(pkg.homepage, metadata.homepage); assert.deepEqual(pkg.repository, metadata.repository); assert.deepEqual(pkg.author, metadata.author);
    assert.deepEqual(pkg.dependencies, {}); assert.equal(pkg.main, 'deploy/desktop/client-main.cjs');
    assert.equal(commands.length, 1);
    assert.deepEqual(Array.from(commands[0].args).filter(arg => /^--(?:x64|ia32|arm64|armv7l)$/.test(arg)), ['--x64']);
    assert.ok(commands[0].args.includes('--publish=never'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/**
 * 执行桌面入口并记录窗口、托盘和网关调用，不触碰真实桌面或用户配置。
 * @param {string} role server 或 client。
 * @param {object} options 打包状态、环境覆盖及模拟启动异常。
 * @returns {Promise<object>} 调用记录与临时目录清理函数。
 */
async function runDesktop(role, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-desktop-'));
  const application = path.join(root, 'app.asar');
  fs.mkdirSync(application);
  fs.writeFileSync(path.join(application, 'config.js'), 'module.exports=' + JSON.stringify(options.config || { 'client.serverUrl': 'http://localhost:1234', 'client.port': 8080 }));
  const calls = { windows: [], errors: [], quit: 0, backend: 0, close: 0 };
  const env = { ...options.env };
  const app = new EventEmitter();
  app.isPackaged = options.packaged ?? true;
  app.getAppPath = () => application;
  app.getPath = () => path.join(root, 'user');
  app.requestSingleInstanceLock = () => options.lock !== false;
  app.quit = () => { calls.quit++; };
  let ready;
  app.whenReady = () => ({ then: callback => { ready = Promise.resolve().then(callback); return ready; } });
  class BrowserWindow {
    constructor(configuration) { calls.windows.push(configuration); }
    async loadURL(url) { calls.url = url; }
  }
  class Tray {
    setToolTip(value) { calls.tooltip = value; }
    setContextMenu(value) { calls.menu = value; }
  }
  const electron = { app, BrowserWindow, Tray, Menu: { buildFromTemplate: value => value }, nativeImage: { createFromPath: value => value }, shell: { openPath: value => { calls.opened = value; } }, dialog: { showErrorBox: (...values) => calls.errors.push(values) } };
  const gateway = new EventEmitter();
  gateway.listen = (port, bindIP, callback) => {
    calls.port = port; calls.bindIP = bindIP;
    if (options.listenError) gateway.emit('error', new Error('端口被占用'));
    else callback();
  };
  gateway.address = () => ({ port: calls.port || 4567 });
  gateway.close = () => { calls.close++; };
  const requireMock = name => {
    if (name === 'electron') return electron;
    if (name === '../client/gateway.cjs') return { loadClientConfiguration, createGateway: configuration => { calls.gateway = configuration; return gateway; } };
    if (name === '../../index.js') { calls.backend++; if (options.backendError) throw new Error('数据库不可用'); return {}; }
    if (name === './backend-process.cjs') return { startBackend: () => { calls.backend++; if (options.backendError) throw new Error('数据库不可用'); return null; } };
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../deploy/desktop', role + '-main.cjs'), 'utf8'), { require: requireMock, process: { env } });
  await ready;
  return { root, application, app, env, calls, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('独立桌面客户端首次复制配置，加载默认解包资源且退出关闭网关', async () => {
  const context = await runDesktop('client');
  try {
    assert.equal(context.calls.gateway.upstream, 'http://localhost:1234');
    assert.equal(context.calls.gateway.root, path.join(context.application + '.unpacked', 'client'));
    assert.equal(context.calls.port, 8080);
    assert.equal(context.calls.url, 'http://127.0.0.1:8080/');
    assert.equal(context.calls.backend, 0);
    assert.equal(context.calls.windows[0].webPreferences.contextIsolation, true);
    assert.equal(fs.existsSync(path.join(context.root, 'user/config.js')), true);
    context.app.emit('before-quit'); assert.equal(context.calls.close, 1);
  } finally { context.cleanup(); }
});

test('独立桌面客户端保留自定义静态目录，服务端地址及监听环境变量优先', async () => {
  const context = await runDesktop('client', { config: { 'client.staticPath': 'custom', 'client.serverUrl': 'http://localhost:1234' }, env: { SERVER_URL: 'http://localhost:9000', CLIENT_PORT: '0', CLIENT_BIND_IP: '127.0.0.1' } });
  try {
    assert.equal(context.calls.gateway.root, path.join(context.application, 'custom'));
    assert.equal(context.calls.gateway.upstream, 'http://localhost:9000');
    assert.equal(context.calls.bindIP, '127.0.0.1');
    assert.equal(context.calls.url, 'http://127.0.0.1:4567/');
  } finally { context.cleanup(); }
  const override = await runDesktop('client', { env: { CLIENT_PATH: 'assets-override' } });
  try { assert.equal(override.calls.gateway.root, path.join(override.application, 'assets-override')); }
  finally { override.cleanup(); }
});

test('独立桌面客户端监听失败显示实际异常，不打开空窗口', async () => {
  const context = await runDesktop('client', { listenError: true });
  try {
    assert.equal(context.calls.windows.length, 0);
    assert.equal(context.calls.errors[0][1], '端口被占用');
    assert.equal(context.calls.quit, 1);
  } finally { context.cleanup(); }
});

test('独立桌面服务端保留部署环境覆盖，只启动后端并提供托盘目录入口', async () => {
  const context = await runDesktop('server', { env: { CONFIG_PATH: 'custom-config.js', DATA_PATH: 'custom-data', LOG_PATH: 'custom-logs' } });
  try {
    assert.equal(context.calls.backend, 1);
    assert.equal(context.calls.windows.length, 0);
    assert.equal(context.env.CLIENT_MODE, 'external');
    assert.equal(context.env.DATA_PATH, 'custom-data');
    assert.equal(context.env.LOG_PATH, 'custom-logs');
    assert.equal(context.env.CONFIG_PATH, 'custom-config.js');
    context.calls.menu.find(item => item.label === '打开数据目录').click();
    assert.equal(context.calls.opened, 'custom-data');
  } finally { context.cleanup(); }
});

test('独立桌面服务端同步启动失败显示原因并退出', async () => {
  const context = await runDesktop('server', { backendError: true });
  try { assert.equal(context.calls.errors[0][1], '数据库不可用'); assert.equal(context.calls.quit, 1); }
  finally { context.cleanup(); }
});

test('两端单实例锁失败时均不启动服务或窗口', async () => {
  for (const role of ['server', 'client']) {
    const context = await runDesktop(role, { lock: false });
    try { assert.equal(context.calls.backend, 0); assert.equal(context.calls.gateway, undefined); assert.equal(context.calls.windows.length, 0); assert.equal(context.calls.quit, 1); }
    finally { context.cleanup(); }
  }
});

test('打包后端使用独立 Node ABI 和外部资源目录，路径更新可返回桌面壳且退出终止子进程', () => {
  const app = new EventEmitter(); app.isPackaged = true; app.getAppPath = () => path.join(os.tmpdir(), 'llx-mock/resources/app.asar');
  const child = new EventEmitter(); child.connected = true;
  let disconnected = false, killed = false, invocation, configuration;
  child.disconnect = () => { disconnected = true; }; child.kill = () => { killed = true; };
  const context = { require: name => name === 'node:child_process' ? { fork: (...args) => { invocation = args; return child; } } : require(name), process: { platform: 'win32', env: { DATA_PATH: 'isolated-data' } }, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../deploy/desktop/backend-process.cjs'), 'utf8'), context);
  context.module.exports.startBackend(app, value => { configuration = value; });
  assert.equal(invocation[2].execPath, path.join(os.tmpdir(), 'llx-mock/resources/backend/runtime/node.exe'));
  assert.equal(invocation[2].cwd, path.join(os.tmpdir(), 'llx-mock/resources/backend'));
  assert.equal(invocation[2].env.DATA_PATH, 'isolated-data');
  assert.equal(invocation[2].execArgv.length, 0);
  child.emit('message', { type: 'configuration', playerPath: '/listen' }); assert.equal(configuration.playerPath, '/listen');
  app.emit('before-quit'); assert.equal(disconnected, true); assert.equal(killed, true);
});
