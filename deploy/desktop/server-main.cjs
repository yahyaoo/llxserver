/** 独立桌面服务端：启动 API 与同步服务，托盘提供配置及数据目录入口。 @author yahyaoo */
const { app, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startBackend } = require('./backend-process.cjs');
let tray;
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
  try {
    const root = process.env.CONFIG_PATH ? path.dirname(path.resolve(process.env.CONFIG_PATH)) : app.getPath('userData');
    fs.mkdirSync(root, { recursive: true });
    process.env.CONFIG_PATH ||= path.join(root, 'config.js');
    process.env.DATA_PATH ||= path.join(root, 'data');
    process.env.LOG_PATH ||= path.join(root, 'logs');
    process.env.CLIENT_MODE = 'external';
    const backend = startBackend(app);
    backend?.on('error', error => { dialog.showErrorBox('服务端启动失败', error.message); app.quit(); });
    backend?.on('exit', code => { if (code) { dialog.showErrorBox('服务端异常退出', `后端退出码：${code}`); app.quit(); } });
    tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'deploy/desktop/icons/tray.png')));
    tray.setToolTip('洛洛雪音乐服务端');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '洛洛雪音乐服务端运行中', enabled: false },
      { label: '打开配置目录', click: () => shell.openPath(path.dirname(process.env.CONFIG_PATH)) },
      { label: '打开数据目录', click: () => shell.openPath(process.env.DATA_PATH) },
      { type: 'separator' }, { label: '退出服务端', click: () => app.quit() },
    ]));
  } catch (error) { dialog.showErrorBox('服务端启动失败', error.message); app.quit(); }
});
app.on('window-all-closed', () => {});
