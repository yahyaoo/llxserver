/** 验证单仓库打包布局、版本同步与个人配置隔离。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, PACK, preparePayload } = require('./build');

test('构建入口只引用当前仓库', () => {
  assert.equal(ROOT, path.resolve(__dirname, '../..'));
  assert.equal(PACK, path.join(ROOT, 'fnos/levis.lxserver'));
});

test('生成载荷同步版本，排除开发机配置并清理旧产物', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-fnos-build-'));
  try {
    const pack = path.join(root, 'fnos/levis.lxserver');
    for (const dir of ['server', 'public', 'fnos/levis.lxserver/app/server']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    const pkg = { name: 'fixture', version: '2.1.3', dependencies: { fixture: '1.0.0' } };
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version: pkg.version, packages: { '': pkg } }));
    fs.writeFileSync(path.join(pack, 'manifest'), 'version = old\ninstall_type =\n');
    fs.writeFileSync(path.join(root, 'index.js'), 'entry');
    fs.writeFileSync(path.join(root, 'server/index.js'), 'compiled-current-source');
    fs.writeFileSync(path.join(root, 'public/index.html'), 'current-public');
    fs.writeFileSync(path.join(root, 'config.js'), 'private-runtime-secret');
    fs.writeFileSync(path.join(pack, 'app/server/stale.js'), 'stale');
    const payload = preparePayload(root, pack);
    assert.equal(fs.readFileSync(path.join(payload, 'server/index.js'), 'utf8'), 'compiled-current-source');
    assert.equal(fs.readFileSync(path.join(payload, 'public/index.html'), 'utf8'), 'current-public');
    assert.equal(fs.existsSync(path.join(payload, 'stale.js')), false);
    assert.equal(fs.readFileSync(path.join(payload, 'config.js'), 'utf8').includes('private-runtime-secret'), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(payload, 'package.json'))).version, pkg.version);
    assert.match(fs.readFileSync(path.join(pack, 'manifest'), 'utf8'), /version\s*=\s*2.1.3/);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
    lock.version = 'other';
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
    assert.throws(() => preparePayload(root, pack), /锁文件版本不一致/);
    assert.throws(() => preparePayload(root, path.join(root, '../other')), /打包目录必须/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
