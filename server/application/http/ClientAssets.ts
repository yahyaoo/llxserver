import fs from 'node:fs'
import path from 'node:path'

/** 独立部署只加载资源目录元数据，内容由客户端返回；整体部署继续读取本地文件。 @author yahyaoo */
const external = process.env.CLIENT_MODE === 'external'
const metadata = external ? JSON.parse(fs.readFileSync(path.join(__dirname, '../../client-assets.json'), 'utf8')) : null
const files = new Set<string>(metadata?.files || [])

/** @param filename 原静态资源路径。 @returns 构建清单或真实目录中是否存在该文件。 */
export function clientFileExists(filename: string): boolean {
  if (!external) return fs.existsSync(filename) && fs.statSync(filename).isFile()
  return files.has(path.relative(global.lx.staticPath, filename).replace(/\\/g, '/'))
}
/** @returns 独立部署使用的公开版本、哈希和 PWA 模板；整体部署返回空值。 */
export function clientMetadata(): any { return metadata }
/** @returns 是否将静态资源响应交给客户端进程。 */
export function externalClient(): boolean { return external }
