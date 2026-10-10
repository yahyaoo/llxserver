import http, { type IncomingMessage, type ServerResponse, type OutgoingHttpHeaders } from 'node:http'
import https from 'node:https'
import type { UserSession } from './UserSessionStore'

/** @param input 用户选择的地址。@returns 无路径和凭据的 HTTP 服务地址。 */
export function remoteOrigin(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error('请输入远程服务器地址')
  const url = new URL(input.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('服务器地址必须是 http:// 或 https:// 地址，不含路径和凭据')
  return url.origin
}
/** @param req 原始请求。@param res 原始响应。@param session 已登录的远程会话。流式转发接口、音频和上传。 */
export async function proxyRemoteRequest(req: IncomingMessage, res: ServerResponse, session: UserSession): Promise<void> {
  const target = new URL(req.url || '/', session.remoteUrl)
  if (target.searchParams.has('token')) target.searchParams.set('token', session.remoteToken || '')
  const transport = target.protocol === 'https:' ? https : http
  const headers: OutgoingHttpHeaders = { ...req.headers, host: target.host, 'x-user-token': session.remoteToken, 'x-user-name': req.headers['x-user-name'] || session.username }
  delete headers.cookie
  delete headers['x-frontend-auth']
  delete headers.connection
  // 禁止形成级联代理循环；远程服务端只处理它自身的用户令牌。
  headers['x-lx-remote-hop'] = '1'
  await new Promise<void>(resolve => {
    const upstream = transport.request(target, { method: req.method, headers }, response => {
      const result = { ...response.headers }
      delete result['set-cookie']
      delete result['access-control-allow-origin']
      res.writeHead(response.statusCode || 502, result)
      response.pipe(res)
      response.on('end', resolve)
      response.on('error', () => { res.destroy(); resolve() })
      res.on('close', () => { upstream.destroy(); resolve() })
    })
    upstream.setTimeout(30000, () => upstream.destroy(new Error('远程服务器超时')))
    upstream.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: '无法连接远程服务器' })) } else res.destroy(); resolve() })
    req.on('aborted', () => upstream.destroy())
    req.pipe(upstream)
  })
}
