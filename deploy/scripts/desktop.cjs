/** 为整体、独立服务端或独立客户端准备干净交付目录，再交给 Electron Builder。 @author yahyaoo */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packageApplication } = require('./package.cjs');
const { prepareNodeRuntime, version: nodeVersion } = require('./node-runtime.cjs');
const root = path.resolve(__dirname, '../..');

/** @param {string} mode 打包角色。 @param {string[]} args Electron Builder 平台和架构参数。 */
async function buildDesktop(mode, args) {
  await packageApplication(mode);
  const platform = args.includes('--win') ? 'win32' : args.includes('--mac') ? 'darwin' : args.includes('--linux') ? 'linux' : process.platform;
  const explicit = ['x64', 'ia32', 'arm64', 'armv7l'].filter(arch => args.includes('--' + arch));
  const architectures = explicit.length ? explicit : platform === 'win32' ? ['x64', 'ia32', 'arm64'] : platform === 'darwin' ? ['x64', 'arm64'] : ['x64', 'arm64', 'armv7l'];
  if (mode !== 'client' && platform !== process.platform) throw new Error('含服务端的桌面包请在目标操作系统构建，以正确准备原生依赖');
  const version = require(path.join(root, 'node_modules/electron/package.json')).version;
  const main = mode === 'all' ? 'deploy/desktop/main.js' : `deploy/desktop/${mode}-main.cjs`;
  for (const arch of architectures) {
    const project = path.join(root, 'output', `desktop-${mode}-${platform}-${arch}`);
    fs.rmSync(project, { recursive: true, force: true });
    fs.mkdirSync(project, { recursive: true });
    const source = path.join(root, 'output', 'llxserver-' + mode);
    fs.cpSync(path.join(root, 'deploy/desktop'), path.join(project, 'deploy/desktop'), { recursive: true });
    const pkg = require(path.join(root, 'package.json'));
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'llxserver-desktop-' + mode, version: pkg.version, description: pkg.description, author: pkg.author, homepage: pkg.homepage, repository: pkg.repository, license: pkg.license, dependencies: {}, main }, null, 2));
    fs.copyFileSync(path.join(source, 'config.js'), path.join(project, 'config.js'));
    if (mode !== 'server') {
      fs.cpSync(path.join(source, 'client'), path.join(project, 'client'), { recursive: true });
      fs.cpSync(path.join(source, 'deploy/client'), path.join(project, 'deploy/client'), { recursive: true });
    }
    const backend = path.join(project, 'backend');
    // 客户端也创建空目录，使统一 extraResources 配置有效，但不包含后端载荷。
    fs.mkdirSync(backend, { recursive: true });
    if (mode !== 'client') {
      fs.cpSync(source, backend, { recursive: true, filter: filename => !filename.startsWith(path.join(source, 'client')) && !filename.startsWith(path.join(source, 'node_modules')) });
      if (fs.existsSync(path.join(source, 'client/music/bin'))) fs.cpSync(path.join(source, 'client/music/bin'), path.join(backend, 'client/music/bin'), { recursive: true });
      fs.mkdirSync(path.join(backend, 'deploy/desktop'), { recursive: true });
      fs.copyFileSync(path.join(root, 'deploy/desktop/backend.cjs'), path.join(backend, 'deploy/desktop/backend.cjs'));
      const runtime = await prepareNodeRuntime(root, platform, arch);
      fs.mkdirSync(path.join(backend, 'runtime'), { recursive: true });
      fs.copyFileSync(runtime, path.join(backend, 'runtime', path.basename(runtime)));
      fs.copyFileSync(path.join(path.dirname(runtime), 'LICENSE'), path.join(backend, 'runtime/LICENSE'));
      if (platform !== 'win32') fs.chmodSync(path.join(backend, 'runtime/node'), 0o755);
      // 依赖始终使用 Node ABI；Electron Builder 不再介入后端的原生模块。
      // Electron 和下载文件使用 armv7l，Node 原生插件架构名使用 arm。
      const env = { ...process.env, npm_config_runtime: 'node', npm_config_target: nodeVersion, npm_config_arch: arch === 'armv7l' ? 'arm' : arch, npm_config_platform: platform, npm_config_disturl: 'https://nodejs.org/dist' };
      // Windows 的 npm 与 node.exe 同级；Linux/macOS 官方运行时放在 ../lib/node_modules。
      const npmCLI = process.env.npm_execpath || path.join(path.dirname(require.resolve('npm/package.json', { paths: [path.dirname(process.execPath), path.resolve(path.dirname(process.execPath), '../lib')] })), 'bin/npm-cli.js');
      execFileSync(process.execPath, [npmCLI, 'ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: backend, env, stdio: 'inherit', windowsHide: true });
    }
    execFileSync(process.execPath, [path.join(root, 'node_modules/electron-builder/out/cli/cli.js'), '--projectDir', project, '--config', path.join(root, 'deploy/desktop/electron-builder.yml'), `--config.electronVersion=${version}`, `--config.extraMetadata.main=${main}`, `--config.productName=洛洛雪音乐${mode === 'server' ? '服务端' : mode === 'client' ? '客户端' : ''}`, `--config.appId=${mode === 'all' ? 'com.lxserver.desktop' : 'com.llxserver.' + mode}`, `--config.directories.output=${path.join(root, 'dist-electron', mode)}`, '--publish=never', ...args.filter(arg => !['x64', 'ia32', 'arm64', 'armv7l'].some(cpu => arg === '--' + cpu)), '--' + arch], { cwd: root, stdio: 'inherit', windowsHide: true });
  }
}
if (require.main === module) buildDesktop(process.argv[2] || 'all', process.argv.slice(3)).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildDesktop };
