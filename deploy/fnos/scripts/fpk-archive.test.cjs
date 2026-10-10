/** 飞牛归档权限和应用载荷的回归测试。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { entries, normalizeArchive, validateArchive } = require('./fpk-archive');

/** 生成包含 Windows 权限的最小 ustar 样本，复现此前打包问题。 */
function tar(files) {
  const blocks = [];
  for (const [name, data] of files) {
    const content = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const header = Buffer.alloc(512);
    header.write(name);
    for (const [offset, value, length] of [[100, 0o666, 8], [108, 0, 8], [116, 0, 8], [124, content.length, 12], [136, 0, 12]]) {
      header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length);
    }
    header[156] = 48;
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.fill(32, 148, 156);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
function fixture(manifest = 'appname = levis.lxserver\nplatform = x86\ninstall_type =\n') {
  return tar([
    ['manifest', manifest], ['app.tgz', tar([['server/dist/server/server/serverDownloads.js', 'compiled payload']])],
    ['wizard/install', '[]'], ['config/privilege', '{}'], ['config/resource', '{}'],
    ['cmd/main', '#!/bin/bash\nexit 0\n'], ['cmd/install_init', '#!/bin/bash\nexit 0\n'], ['cmd/install_callback', '#!/bin/bash\nexit 0\n'],
  ]);
}
test('旧归档缺少脚本执行权限时拒绝交付', () => {
  assert.throws(() => validateArchive(fixture()), /执行权限/);
});
test('修正归档可通过校验，所有文件内容保持一致', () => {
  const before = fixture();
  const after = normalizeArchive(before);
  assert.deepEqual(validateArchive(after), { files: 8, applicationFiles: 1 });
  const originals = entries(zlib.gunzipSync(before));
  const fixed = entries(zlib.gunzipSync(after));
  for (let i = 0; i < originals.length; i++) {
    assert.deepEqual(fixed[i].content, originals[i].content);
    assert.equal(parseInt(fixed[i].header.subarray(100, 108).toString(), 8), originals[i].filename.startsWith('cmd/') ? 0o755 : 0o644);
    const header = Buffer.from(fixed[i].header);
    const checksum = parseInt(header.subarray(148, 156).toString(), 8);
    header.fill(32, 148, 156);
    assert.equal(header.reduce((sum, byte) => sum + byte, 0), checksum);
  }
});
test('Windows 换行和损坏的归档不能通过校验', () => {
  const manifest = 'appname = levis.lxserver\r\nplatform = x86\r\ninstall_type =\r\n';
  assert.throws(() => validateArchive(fixture(manifest)), /Linux 换行/);
  assert.equal(validateArchive(normalizeArchive(fixture(manifest))).files, 8);
  assert.throws(() => normalizeArchive(Buffer.from('broken')));
});
test('安装包保留系统选盘声明，不接受 root 或空平台', () => {
  assert.throws(() => validateArchive(normalizeArchive(fixture('platform=x86\ninstall_type=root\n'))), /install_type/);
  assert.throws(() => validateArchive(normalizeArchive(fixture('platform=\ninstall_type=\n'))), /x86/);
  assert.equal(validateArchive(normalizeArchive(fixture())).files, 8);
});
