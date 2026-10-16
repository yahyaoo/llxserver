/** 生成纯静态客户端；不复制服务端、数据库或生产依赖。 @author yahyaoo */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const destination = path.join(root, 'dist/client');
require('./build-styles.cjs');
require('./static-manifest.cjs');
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(path.join(root, 'client'), destination, { recursive: true, filter: file => !file.startsWith(path.join(root, 'client/music/bin')) });
console.log('客户端构建完成：dist/client');
