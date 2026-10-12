import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { BrowserStorageService } from '../service/configuration/BrowserStorageService'

/** 浏览器存储依赖契约，隔离管理服务及其数据库。 @author yahyaoo */
export interface BrowserStorageDependencies {
  /** 用户令牌验证。 */
  verifyUser: (req: IncomingMessage) => string | null
  /** 已解析用户目录。 */
  userDirectory: (username: string) => string
  /** 播放器 SQLite 仓储。 */
  service: BrowserStorageService
}

/**
 * 浏览器歌单缓存接口。账号和随机设备键联合隔离，不修改共享歌单业务。
 * @param req HTTP 请求，提供认证头与上传正文。
 * @param res HTTP 响应，用于写入状态码和处理结果。
 * @param dependencies 当前音乐域能力。
 * @returns 请求完成结果。
 * @author yahyaoo
 */
export async function browserList(req: IncomingMessage, res: ServerResponse, dependencies: BrowserStorageDependencies, kind: 'list' | 'playback' | 'queue' = 'list'): Promise<void> {
  const device = String(req.headers['x-browser-device'] || '')
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(device)) { res.writeHead(400); res.end('无效浏览器设备标识'); return }
  const verified = dependencies.verifyUser(req)
  const requested = String(req.headers['x-user-name'] || '')
  if (!verified && requested && !['default', 'open', '_open'].includes(requested)) { res.writeHead(401); res.end('Unauthorized'); return }
  const key = path.join(dependencies.userDirectory(verified || '_open'), 'browser', device, kind === 'list' ? 'browser-state.json' : kind + '-state.json')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    if (req.method === 'GET') {
      res.end(JSON.stringify({ value: dependencies.service.get(key) })); return
    }
    if (req.method === 'DELETE') {
      dependencies.service.remove(key)
      res.end('{"success":true}'); return
    }
    if (req.method !== 'PUT') { res.writeHead(405); res.end('{"success":false}'); return }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 20 * 1024 * 1024) throw new Error('歌单数据不能超过 20 MB')
      chunks.push(Buffer.from(chunk))
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    dependencies.service.replace(key, value)
    res.end('{"success":true}')
  } catch (error: any) {
    res.writeHead(400); res.end(JSON.stringify({ success: false, message: error.message }))
  }
}
