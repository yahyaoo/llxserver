/** 为独立服务端生成静态资源目录、PWA 模板和公开构建信息。 @author yahyaoo */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const client = path.join(root, 'client');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [path.relative(client, file).replace(/\\/g, '/')];
  });
}
const config = fs.readFileSync(path.join(client, 'js/config.js'), 'utf8');
const metadata = { files: walk(client).filter(file => !file.startsWith('music/bin/')), manifest: JSON.parse(fs.readFileSync(path.join(client, 'music/manifest.json'), 'utf8')), version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, buildHash: config.match(/buildHash:\s*['"]([^'"]+)['"]/)?.[1] || 'unknown' };
fs.writeFileSync(path.join(root, 'dist/server/client-assets.json'), JSON.stringify(metadata));
