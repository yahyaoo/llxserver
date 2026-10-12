/** 验证单仓库打包布局、版本同步与个人配置隔离。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, PACK, preparePayload } = require('./build');

test('构建入口只引用当前仓库', () => {
  assert.equal(ROOT, path.resolve(__dirname, '../../..'));
  assert.equal(PACK, path.join(ROOT, 'deploy/fnos/llxserver.all'));
});

/** 检查安装和升级入口，不再收集播放器及控制台密码。作者：jingyh */
test('飞牛向导移除两个密码项，安装和升级均初始化默认账号', () => {
  for (const mode of ['all', 'server']) {
    const template = path.join(ROOT, 'deploy/fnos/llxserver.' + mode)
    const wizard = JSON.parse(fs.readFileSync(path.join(template, 'wizard/install'), 'utf8'))
    assert.ok(wizard.every(step => step.items.every(item => item.type !== 'password')))
    for (const callback of ['install_callback', 'upgrade_callback']) {
      const source = fs.readFileSync(path.join(template, 'cmd', callback), 'utf8')
      assert.ok(source.includes('InstallationConfiguration.js'))
      assert.equal(/wizard_(player|admin)_password|LX_INSTALL_(PLAYER|ADMIN)_PASSWORD/.test(source), false)
    }
  }
});

test('生成载荷同步版本，排除开发机配置并清理旧产物', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-fnos-build-'));
  try {
    const pack = path.join(root, 'deploy/fnos/llxserver.all');
    for (const dir of ['dist/server', 'dist/client', 'deploy/fnos/llxserver.all/app/server']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    const pkg = { name: 'fixture', version: '2.1.3', dependencies: { fixture: '1.0.0' } };
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version: pkg.version, packages: { '': pkg } }));
    fs.writeFileSync(path.join(pack, 'manifest'), 'version = old\ninstall_type =\n');
    fs.writeFileSync(path.join(root, 'index.js'), 'entry');
    fs.mkdirSync(path.join(root, 'deploy/node'), { recursive: true });
    fs.writeFileSync(path.join(root, 'deploy/node/start.cjs'), 'launcher');
    fs.writeFileSync(path.join(root, 'dist/server/index.js'), 'compiled-current-source');
    fs.writeFileSync(path.join(root, 'dist/client/index.html'), 'current-public');
    fs.mkdirSync(path.join(root, 'dist/client/music/js'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/client/music/js/song_identity.js'), 'current-shared-identity');
    fs.writeFileSync(path.join(root, 'config.js'), 'private-runtime-secret');
    fs.writeFileSync(path.join(pack, 'app/server/stale.js'), 'stale');
    const payload = preparePayload(root, pack);
    assert.equal(fs.readFileSync(path.join(payload, 'dist/server/index.js'), 'utf8'), 'compiled-current-source');
    assert.equal(fs.readFileSync(path.join(payload, 'client/index.html'), 'utf8'), 'current-public');
    assert.equal(fs.existsSync(path.join(payload, 'stale.js')), false);
    assert.equal(fs.readFileSync(path.join(payload, 'config.js'), 'utf8').includes('private-runtime-secret'), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(payload, 'package.json'))).version, pkg.version);
    assert.match(fs.readFileSync(path.join(pack, 'manifest'), 'utf8'), /version\s*=\s*2.1.3/);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
    // 独立服务端只携带必需的共享脚本，不带播放器首页。作者：jingyh
    const serverPack = path.join(root, 'deploy/fnos/llxserver.server');
    fs.mkdirSync(serverPack, { recursive: true });
    fs.writeFileSync(path.join(serverPack, 'manifest'), 'version = old\n');
    const serverPayload = preparePayload(root, serverPack, 'server');
    assert.equal(fs.readFileSync(path.join(serverPayload, 'client/music/js/song_identity.js'), 'utf8'), 'current-shared-identity');
    assert.equal(fs.existsSync(path.join(serverPayload, 'client/index.html')), false);
    lock.version = 'other';
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
    assert.throws(() => preparePayload(root, pack), /锁文件版本不一致/);
    assert.throws(() => preparePayload(root, path.join(root, '../other')), /打包目录必须/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
