/**
 * 由桌面壳启动的 Node 后端入口，将有效访问路径告知父进程。
 * 父进程断开时退出，防止托盘关闭后残留服务占用端口。
 * @author yahyaoo
 */
require('../../index.js');
const timer = setInterval(() => {
  if (!global.lx?.config) return;
  process.send?.({ type: 'configuration', playerPath: global.lx.config['player.path'], adminPath: global.lx.config['admin.path'] });
}, 200);
timer.unref();
process.on('disconnect', () => process.exit());
