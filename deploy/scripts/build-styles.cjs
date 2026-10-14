/** 固定版本 Tailwind CLI；生成失败立即停止交付。 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const result = spawnSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-c', 'tailwind.config.cjs', '-i', 'client/music/css/tailwind.input.css', '-o', 'client/music/css/tailwind.generated.css', '--minify'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
