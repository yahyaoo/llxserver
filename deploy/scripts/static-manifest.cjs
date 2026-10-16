/** 从实际静态文件生成摘要白名单；更新 SW 脚本版本以触发浏览器正常更新。 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../client/music');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name), name = path.relative(root, file).replace(/\\/g, '/');
    if (entry.isDirectory()) return ['bin'].includes(name) ? [] : walk(file);
    return /\.(js|css|woff2?|svg|png|jpg|ico)$/.test(name) && !['sw.js','js/static-manifest.js'].includes(name) && !name.endsWith('.input.css') ? [name] : [];
  });
}
const files = Object.fromEntries(walk(root).sort().map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
const version = hash(JSON.stringify(files) + fs.readFileSync(path.join(root, 'sw.js'), 'utf8')).slice(0, 20);
fs.writeFileSync(path.join(root, 'static-assets.json'), JSON.stringify({ version, files }, null, 2) + '\n');
// 浏览器的 SW 更新检查包含 importScripts 的依赖；不在构建时改写手写 SW。
fs.writeFileSync(path.join(root, 'js/static-manifest.js'), 'self.STATIC_BUILD = ' + JSON.stringify({ version, files }) + ';\n');
console.log('静态资源摘要：' + version + '，' + Object.keys(files).length + ' 项');
