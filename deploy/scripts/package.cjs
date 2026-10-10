/** 生成整体、服务端或客户端交付目录及 ZIP，不携带运行数据和个人配置。 @author yahyaoo */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

/** @param {string} mode all、server 或 client。 @returns {Promise<string>} 生成的 ZIP 绝对路径。 */
async function packageApplication(mode) {
  const { ZipArchive } = await import('archiver');
  if (!['all', 'server', 'client'].includes(mode)) throw new Error('打包模式必须为 all、server 或 client');
  const directory = path.join(root, 'output', `llxserver-${mode}`);
  for (const relative of mode === 'client' ? ['dist/client'] : mode === 'server' ? ['dist/server'] : ['dist/server', 'dist/client']) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error('缺少构建输出：' + relative);
  }
  fs.rmSync(directory, { recursive: true, force: true }); fs.mkdirSync(directory, { recursive: true });
  const copy = (from, to = from) => fs.cpSync(path.join(root, from), path.join(directory, to), { recursive: true });
  if (mode !== 'client') {
    copy('dist/server'); copy('deploy/node/start.cjs'); copy('index.js'); copy('LICENSE');
    fs.writeFileSync(path.join(directory, 'config.js'), '/** SQLite 引导路径在运行目录中创建。 @author yahyaoo */\nmodule.exports = {};\n');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    const manifest = { name: pkg.name, version: pkg.version, private: true, engines: pkg.engines, dependencies: pkg.dependencies, scripts: { start: 'node index.js' } };
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'))); lock.packages[''] = manifest;
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify(lock, null, 2));
  }
  if (mode !== 'server') { copy('dist/client', 'client'); copy('deploy/client/gateway.cjs'); }
  // 可选指纹工具属于服务端，独立客户端永远不包含可执行二进制。
  if (mode !== 'client' && fs.existsSync(path.join(root, 'client/music/bin'))) copy('client/music/bin');
  if (mode === 'client') {
    copy('LICENSE');
    const pkg = require(path.join(root, 'package.json'));
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'llxserver-client', version: pkg.version, description: '洛洛雪音乐客户端', author: 'yahyaoo', license: pkg.license, private: true, scripts: { start: 'node deploy/client/gateway.cjs' }, engines: { node: '>=20' } }, null, 2));
  }
  fs.writeFileSync(path.join(directory, 'config.js'), '/** 服务端引导与客户端连接配置。 @author yahyaoo */\nmodule.exports = ' + JSON.stringify({ ...(mode !== 'client' ? { 'server.database.adminPath': 'database/admin.sqlite', 'server.database.musicPath': 'database/music.sqlite' } : {}), ...(mode !== 'server' ? { 'client.serverUrl': 'http://127.0.0.1:9527', 'client.port': 9528, 'client.bindIP': '0.0.0.0' } : {}) }, null, 2) + '\n');
  const zip = directory + '.zip';
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zip), archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve); output.on('error', reject); archive.on('error', reject);
    archive.pipe(output); archive.directory(directory, `llxserver-${mode}`); archive.finalize();
  });
  console.log('交付包已生成：' + zip); return zip;
}
if (require.main === module) packageApplication(process.argv[2] || 'all').catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { packageApplication };
