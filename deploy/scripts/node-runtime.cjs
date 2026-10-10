/** 为桌面交付包下载并校验官方 Node 运行时，缓存按系统和架构隔离。 @author yahyaoo */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const unzipper = require('unzipper');
const version = '22.22.3';

/**
 * 返回已验证的 Node 可执行文件，缺少官方构建或校验失败时中止打包。
 * @param {string} root 项目根目录。
 * @param {string} platform win32、darwin 或 linux。
 * @param {string} arch Electron 目标架构。
 * @returns {Promise<string>} 缓存中的运行时路径。
 */
async function prepareNodeRuntime(root, platform, arch) {
  const system = { win32: 'win', darwin: 'darwin', linux: 'linux' }[platform];
  const cpu = { ia32: 'x86', armv7l: 'armv7l', x64: 'x64', arm64: 'arm64' }[arch];
  if (!system || !cpu) throw new Error('不支持的 Node 系统或架构');
  const directory = path.join(root, 'output/node-runtime', `${platform}-${arch}`);
  const executable = path.join(directory, platform === 'win32' ? 'node.exe' : 'node');
  if (fs.existsSync(executable)) return executable;
  fs.mkdirSync(directory, { recursive: true });
  const stem = `node-v${version}-${system}-${cpu}`;
  const filename = stem + (platform === 'win32' ? '.zip' : '.tar.gz');
  const download = name => execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '180', '--output', path.join(directory, name), `https://nodejs.org/dist/v${version}/${name}`], { windowsHide: true, stdio: 'inherit' });
  download('SHASUMS256.txt'); download(filename);
  const expected = fs.readFileSync(path.join(directory, 'SHASUMS256.txt'), 'utf8').split(/\r?\n/).find(line => line.endsWith('  ' + filename))?.split(/\s+/)[0];
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, filename))).digest('hex');
  if (!expected || actual !== expected) throw new Error('Node 运行时 SHA256 校验失败');
  if (platform === 'win32') await (await unzipper.Open.file(path.join(directory, filename))).extract({ path: directory });
  else execFileSync('tar', ['-xzf', path.join(directory, filename), '-C', directory], { windowsHide: true });
  fs.copyFileSync(path.join(directory, stem, platform === 'win32' ? 'node.exe' : 'bin/node'), executable);
  if (platform !== 'win32') fs.chmodSync(executable, 0o755);
  fs.copyFileSync(path.join(directory, stem, 'LICENSE'), path.join(directory, 'LICENSE'));
  return executable;
}
module.exports = { prepareNodeRuntime, version };
