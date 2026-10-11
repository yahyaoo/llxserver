/** 独立桌面客户端：读取 client.xxx，启动本地网关并打开客户端窗口。 @author yahyaoo */
const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createGateway, loadClientConfiguration } = require('../client/gateway.cjs');
let server;
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  try {
    const root = app.getAppPath();
    const userConfig = path.join(app.getPath('userData'), 'config.js');
    if (!process.env.CLIENT_CONFIG_PATH && !process.env.CONFIG_PATH) {
      fs.mkdirSync(path.dirname(userConfig), { recursive: true });
      if (!fs.existsSync(userConfig)) fs.copyFileSync(path.join(root, 'config.js'), userConfig);
    }
    const configuration = loadClientConfiguration({ ...process.env, CLIENT_CONFIG_PATH: process.env.CLIENT_CONFIG_PATH || process.env.CONFIG_PATH || userConfig }, root);
    // 默认资源位于 asar 解包目录；部署者指定的资源路径仍按环境变量和配置文件生效。
    if (app.isPackaged && !process.env.CLIENT_PATH && configuration.root === path.join(root, 'client')) {
      configuration.root = path.join(root + '.unpacked', 'client');
    }
    server = createGateway(configuration);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(configuration.port, configuration.bindIP, resolve); });
    const window = new BrowserWindow({ title: '洛洛雪音乐客户端', width: 1200, height: 850, icon: path.join(root, 'deploy/desktop/icons/icon.png'), autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  } catch (error) { dialog.showErrorBox('客户端启动失败', error.message); app.quit(); }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => server?.close());
