import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
import type { SongFileStatusService } from '../service/library/SongFileStatusService'
import { validateFileStatusSongs } from '../service/library/SongFileStatusService'

/**
 * 批量查询歌曲文件状态，仅使用当前已认证账号的缓存与自定义目录。
 * @param context 请求与响应上下文。
 * @param runtime 已有账号验证与正文读取能力。
 * @param service 可复用的歌曲文件状态组件。
 * @returns HTTP 请求处理完成的 Promise。
 * @author jingyh
 */
export async function songFileStatus(context: RequestContext, runtime: Pick<ServerRuntime, 'verifyUserAuth'>, service: SongFileStatusService): Promise<void> {
  const { req, res } = context
  const username = runtime.verifyUserAuth(req)
  const requested = String(req.headers['x-user-name'] || '')
  const respond = (status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  if (!username) { respond(401, { success: false, message: '请先登录账号' }); return }
  if (requested && requested !== username) { respond(403, { success: false, message: '禁止查询其他用户文件状态' }); return }
  let songs
  try {
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk); size += buffer.length
      if (size > 1024 * 1024) continue
      chunks.push(buffer)
    }
    if (size > 1024 * 1024) throw new Error('歌曲状态请求不能超过 1 MB')
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    songs = data?.songs
    validateFileStatusSongs(songs)
  } catch (error: any) { respond(400, { success: false, message: error.message }); return }
  try {
    const statuses = await service.query(username, songs)
    respond(200, { success: true, statuses })
  } catch {
    respond(503, { success: false, message: '暂时无法读取歌曲文件状态，请稍后重试' })
  }
}
