/**
 * 在独立 Node 运行时中启动后端，避免 Electron V8 与 SQLite 原生模块 ABI 耦合。
 * @author yahyaoo
 */
const path = require('node:path');
const { fork } = require('node:child_process');

/**
 * 创建后端子进程；源码运行时继续使用当前 Node 环境。
 * @param {import('electron').App} app 桌面应用实例。
 * @param {function(object):void} onConfiguration 接收后端有效访问路径。
 * @returns {import('node:child_process').ChildProcess|null} 打包运行的子进程，源码运行返回 null。
 */
function startBackend(app, onConfiguration = () => {}) {
  if (!app.isPackaged) { require('../../index.js'); return null; }
  const root = path.join(path.dirname(app.getAppPath()), 'backend');
  const executable = path.join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
  const child = fork(path.join(root, 'deploy/desktop/backend.cjs'), [], { execPath: executable, execArgv: [], cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  child.on('message', message => { if (message?.type === 'configuration') onConfiguration(message); });
  app.on('before-quit', () => { if (child.connected) child.disconnect(); child.kill(); });
  return child;
}
module.exports = { startBackend };
