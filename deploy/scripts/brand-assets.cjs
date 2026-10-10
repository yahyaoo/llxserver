/** 从统一 SVG 生成网页、桌面及飞牛应用图标，保持不同尺寸一致。 @author yahyaoo */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');

/** @returns {Promise<void>} 写入各部署平台需要的图标文件。 */
async function generateBrandAssets() {
  const logo = path.join(root, 'docs/assets/logo.svg');
  for (const relative of ['client/icon.svg', 'client/music/assets/logo.svg', 'docs/public/icon.svg']) fs.copyFileSync(logo, path.join(root, relative));
  const png = async (file, size) => sharp(logo).resize(size, size).png().toFile(path.join(root, file));
  for (const size of [16, 32, 48, 64, 128, 256, 512]) await png(`deploy/desktop/icons/${size}x${size}.png`, size);
  for (const [file, size] of [['deploy/desktop/icons/icon.png', 512], ['deploy/desktop/icons/tray.png', 32], ['deploy/fnos/llxserver.all/ICON.PNG', 64], ['deploy/fnos/llxserver.all/ICON_256.PNG', 256], ['deploy/fnos/llxserver.all/app/ui/images/64.png', 64], ['deploy/fnos/llxserver.all/app/ui/images/256.png', 256]]) await png(file, size);
  for (const role of ['server', 'client']) for (const [file, size] of [['ICON.PNG', 64], ['ICON_256.PNG', 256], ['app/ui/images/64.png', 64], ['app/ui/images/256.png', 256]]) await png(`deploy/fnos/llxserver.${role}/${file}`, size);
  // ICO 内嵌 PNG，避免为生成 Windows 图标引入额外依赖。
  for (const [file, size] of [['icon.ico', 256], ['tray.ico', 32]]) {
    const image = await sharp(logo).resize(size, size).png().toBuffer();
    const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
    header[6] = size === 256 ? 0 : size; header[7] = header[6]; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(image.length, 14); header.writeUInt32LE(22, 18);
    fs.writeFileSync(path.join(root, 'deploy/desktop/icons', file), Buffer.concat([header, image]));
  }
  await sharp(path.join(root, 'docs/assets/banner.svg')).png().toFile(path.join(root, 'docs/assets/banner.png'));
}
if (require.main === module) generateBrandAssets().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { generateBrandAssets };
