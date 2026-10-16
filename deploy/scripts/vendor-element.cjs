/**
 * 从 npm 官方登记的完整性摘要校验并提取浏览器资源，供离线部署使用。
 * 固定版本与文件白名单，不执行包脚本，不写入服务端生产依赖。
 * @author jingyh
 * @date 2026-10-11
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib')
const destination = path.resolve(__dirname, '../../client/music/assets/element')
const packages = [
  { name: 'vue', version: '3.5.22', files: { 'dist/vue.global.prod.js': 'vue.global.prod.js', LICENSE: 'VUE-LICENSE' } },
  { name: 'element-plus', version: '2.11.5', licenseUrl: 'https://api.github.com/repos/element-plus/element-plus/contents/LICENSE?ref=2.11.5', files: { 'dist/index.full.min.js': 'element-plus.min.js', 'dist/index.css': 'element-plus.css', 'dist/locale/zh-cn.min.js': 'zh-cn.min.js' } },
]
/**
 * 删除 el-input-number 在祖先与后代同时使用 class 属性选择器的两条规则。
 * 此类规则会让浏览器在任意元素 class 变化时重算其整个子树；本项目未使用该控件的 large/small 右侧按钮样式。
 */
function trimInvalidatingRules(css) {
  const pattern = /\.el-input-number\.is-controls-right\[class\*=(?:large|small)\][^{}]*\{[^{}]*\}/g
  if ((css.match(pattern) || []).length !== 2) throw new Error('Element Plus 样式结构已变化，请更新精简规则')
  return css.replace(pattern, '')
}
/** 只提取白名单常规文件，压缩包路径不参与本地路径计算。 */
function extract(archive, files) {
  const result = {}, tar = zlib.gunzipSync(archive)
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
    if (!name) break
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8) || 0
    const relative = name.replace(/^package\//, '')
    if (files[relative] && [0, 48].includes(header[156])) result[files[relative]] = tar.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  for (const file of Object.values(files)) if (!result[file]) throw new Error('压缩包缺少资源：' + file)
  return result
}
async function run() {
  fs.mkdirSync(destination, { recursive: true })
  const manifest = []
  for (const spec of packages) {
    const metadataResponse = await fetch(`https://registry.npmjs.org/${spec.name}/${spec.version}`)
    if (!metadataResponse.ok) throw new Error('读取官方包登记失败')
    const metadata = await metadataResponse.json(), response = await fetch(metadata.dist.tarball)
    if (!response.ok) throw new Error('下载官方包失败')
    const archive = Buffer.from(await response.arrayBuffer()), [algorithm, expected] = metadata.dist.integrity.split('-')
    if (crypto.createHash(algorithm).update(archive).digest('base64') !== expected) throw new Error('资源完整性校验失败')
    const files = extract(archive, spec.files), hashes = {}
    if (files['element-plus.css']) files['element-plus.css'] = Buffer.from(trimInvalidatingRules(files['element-plus.css'].toString('utf8')))
    if (spec.licenseUrl) {
      const license = await fetch(spec.licenseUrl)
      if (!license.ok) throw new Error('读取官方许可证失败')
      const document = await license.json()
      if (document.encoding !== 'base64' || !document.content) throw new Error('官方许可证内容格式异常')
      files['ELEMENT-PLUS-LICENSE'] = Buffer.from(document.content, 'base64')
    }
    for (const [name, bytes] of Object.entries(files)) {
      fs.writeFileSync(path.join(destination, name), bytes)
      hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex')
    }
    manifest.push({ package: spec.name, version: spec.version, integrity: metadata.dist.integrity, licenseUrl: spec.licenseUrl, files: hashes })
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('Element Plus 与 Vue 官方浏览器资源已校验并保存到 client/music/assets/element')
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { extract, trimInvalidatingRules }
