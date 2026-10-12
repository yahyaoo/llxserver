/** 生成 Docker 渠道标签，snapshot 不覆盖正式版本或 latest。 @author yahyaoo */
const fs = require('node:fs');

function imageTags(version, refType, refName) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('应用版本必须为 major.minor.patch');
  if (refType === 'tag' && refName.includes('-snapshot.')) {
    const prefix = `v${version}-snapshot.`;
    if (!refName.startsWith(prefix) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(refName.slice(prefix.length))) throw new Error('snapshot 标签与应用版本不一致或格式非法');
    const tag = refName.slice(1);
    if (tag.length > 128) throw new Error('Docker 标签不能超过 128 字符');
    return { tag, snapshot: true };
  }
  return { tag: version, snapshot: false };
}

if (require.main === module) {
  const { tag, snapshot } = imageTags(require('../../package.json').version, process.env.GITHUB_REF_TYPE || '', process.env.GITHUB_REF_NAME || '');
  if (!process.env.GITHUB_ENV) throw new Error('缺少 GitHub Actions 环境输出路径');
  fs.appendFileSync(process.env.GITHUB_ENV, `IMAGE_TAG=${tag}\nIS_SNAPSHOT=${snapshot}\n`, 'utf8');
}
module.exports = { imageTags };
