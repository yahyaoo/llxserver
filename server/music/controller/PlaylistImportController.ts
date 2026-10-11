import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ConfigurationImportDependencies } from './ConfigurationImportController'
import { readUpload } from './ConfigurationImportController'
import { parsePlaylistImport } from '../service/configuration/PlaylistImportParser'

/**
 * 向已认证账号追加歌单；公开列表写入必须提供管理员身份。
 * @param req HTTP 上传请求，支持 JSON 与单文件表单。
 * @param res HTTP 处理结果，成功时返回完整列表和导入数量。
 * @param target 查询参数中明确指定的目标用户。
 * @param dependencies 现有账号校验、用户空间与事务导入服务。
 * @returns 请求处理完成的 Promise。
 * @author jingyh
 */
export async function importPlaylists(req: IncomingMessage, res: ServerResponse, target: string | null, dependencies: Pick<ConfigurationImportDependencies, 'verifyUser' | 'userSpace' | 'service'>): Promise<void> {
  const verified = dependencies.verifyUser(req)
  const requested = target || String(req.headers['x-user-name'] || '')
  const publicTarget = ['default', 'open', '_open'].includes(requested)
  const adminPassword = global.lx.config['frontend.password']
  const isAdmin = !!adminPassword && req.headers['x-frontend-auth'] === adminPassword
  const reject = (status: number, message: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ success: false, message }))
  }
  if (publicTarget && !isAdmin) { reject(403, '导入公开歌单需要管理员身份'); return }
  if (!publicTarget && !verified) { reject(401, '请先登录账号'); return }
  if (!publicTarget && requested && requested !== verified) { reject(403, '禁止导入到其他用户歌单'); return }
  const username = publicTarget ? '_open' : verified!
  try {
    const text = await readUpload(req)
    const playlists = parsePlaylistImport(JSON.parse(text.replace(/^\uFEFF/, '')))
    const result = await dependencies.service.importPlaylists(dependencies.userSpace(username), playlists)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ ...result, username }))
  } catch (error: any) {
    reject(400, error.message || '歌单导入失败')
  }
}
