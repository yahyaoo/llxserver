import { IncomingMessage, ServerResponse, type IncomingHttpHeaders } from 'node:http'
import { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { storageEvents } from '../persistence/storage'

/** 客户端统一消息协议，沿用原接口鉴权和业务处理。 @author jingyh @date 2026-10-12 */
export interface ClientOperation { id: string; url: string; method: string; data?: any; headers?: Record<string, string>; patch?: boolean; channel?: string; eventId?: string }
type Dispatch = (req: IncomingMessage, res: ServerResponse) => Promise<void>
type Result = { status: number; data: any }
const writable = new Map([
  ['/api/user/settings', 'POST'], ['/api/user/list', 'POST'], ['/api/user/favorites', 'POST'],
  ['/api/user/sound-effects', 'POST'], ['/api/user/appearance', 'PUT'], ['/api/user/sync-download/settings', 'PUT'],
  ['/api/music/storage/playback', 'PUT'], ['/api/music/storage/queue', 'PUT'], ['/api/music/user/list/reorder', 'POST'],
  ['/api/music/cache/config', 'POST'], ['/api/user/recent', 'POST'], ['/api/music/playback', 'POST'],
  ['/api/music/cache/lyric', 'POST'], ['/api/music/cache/download', 'POST'], ['/api/user/account', 'PUT'],
  ['/api/music/cache/queue', 'POST'], ['/api/music/cache/queue/concurrency', 'POST'],
  ['/api/music/cache/queue/pause', 'POST'], ['/api/music/cache/queue/resume', 'POST'], ['/api/music/cache/queue/remove', 'POST'],
  ['/api/music/cache/stop', 'POST'], ['/api/music/remaster/start', 'POST'], ['/api/music/remaster/cancel', 'POST'],
  ['/api/user/library/artists', 'POST'], ['/api/user/library/albums', 'POST'],
  ['/api/user/dislike/library/artists', 'POST'], ['/api/user/dislike/library/albums', 'POST'], ['/api/user/dislike', 'POST'],
])
const patchable = new Set(['/api/user/settings', '/api/user/appearance', '/api/user/sound-effects'])
const signature = (value: unknown) => createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex')
/** 缓存版本用于跳过登录后重复推送的大歌单，客户端不能据此改变任何服务器数据。 */
export const cacheVersions = (entries: Record<string, Result>) => Object.fromEntries(Object.entries(entries).map(([route, result]) => [route, signature(result)]))
export const bootstrapRoutes = [
  '/api/music/config', '/api/config', '/api/user/list', '/api/user/list?user=_open', '/api/user/settings',
  '/api/user/appearance', '/api/user/account', '/api/user/sound-effects', '/api/user/recent',
  '/api/user/library/artists', '/api/user/library/albums', '/api/user/dislike/library/artists', '/api/user/dislike/library/albums',
  '/api/user/library/artists?user=_open', '/api/user/library/albums?user=_open',
  '/api/user/dislike/library/artists?user=_open', '/api/user/dislike/library/albums?user=_open',
  '/api/music/cache/list', '/api/music/cache/list?user=_open', '/api/music/custom/list', '/api/music/cache/config',
  '/api/music/cache/directories', '/api/music/cache/directories?user=_open', '/api/user/sync-download/status',
  '/api/music/tasks/status', '/api/music/tasks/user-data?task=network_list_autocheck',
  '/api/music/storage/playback', '/api/music/storage/queue', '/api/music/dislike', '/api/user/roaming/weights',
  '/api/music/cache/subdirs?folder=music', '/api/music/library/scan', '/api/user/token/config', '/api/music/cache/stats', '/api/custom-source/list',
  '/api/user/account/avatar', '/api/user/appearance/background',
]

/** 只合并客户端实际修改的字段，拒绝原型字段，未修改的服务端值保持原样。 */
export function mergeClientPatch(current: any, patch: any): any {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const merged = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('不允许的配置字段')
    merged[key] = mergeClientPatch(merged[key], value)
  }
  return merged
}

/**
 * 公共通道负责快照、批量提交和页面进度订阅，不重新实现任何业务规则。
 * HTTP 和 WS 使用同一批次标识；响应丢失重试复用结果，避免重复统计。
 * @author jingyh
 */
export class ClientChannel {
  readonly sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 24 * 1024 * 1024 })
  private completed = new Map<string, { time: number; result: Result }>()
  private serial = new Map<string, Promise<unknown>>()
  private clients = new Map<WebSocket, { req: IncomingMessage; subscriptions: Set<string>; signatures: Map<string, string>; dirty: Set<string>; timer?: NodeJS.Timeout; pushing?: boolean; remasterOffset?: number; remasterId?: string }>()
  private progressTimer: NodeJS.Timeout
  private progressing = false
  constructor(private dispatch: Dispatch, private authenticate: (req: IncomingMessage) => string | null,
    private remoteSession?: (req: IncomingMessage) => { remoteUrl?: string; remoteToken?: string } | undefined,
    private userDirectory?: (username: string) => string) {
    storageEvents.on('change', this.changed)
    this.progressTimer = setInterval(() => { void this.progress().catch(() => {}) }, 1000)
    this.progressTimer.unref()
  }

  /** 在进程内调用原路由，保持 Cookie、权限和设备作用域，不发起 HTTP 回环请求。 */
  async invoke(parent: IncomingMessage, operation: Partial<ClientOperation>): Promise<Result> {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback() } })
    const req = new IncomingMessage(socket as any)
    req.url = operation.url; req.method = operation.method || 'GET'
    ;(req as any).clientDispatch = true
    const headers: IncomingHttpHeaders = { ...parent.headers, 'content-type': 'application/json' }
    const owner = this.authenticate(parent)
    if (owner) headers['x-user-name'] = owner
    delete headers['content-length']; delete headers['transfer-encoding']
    // 认证头只能来自已鉴权连接；仅允许业务既有的公共空间和浏览器设备标识。
    if (operation.headers?.['x-user-name'] === '_open') headers['x-user-name'] = '_open'
    if (operation.headers?.['x-browser-device']) headers['x-browser-device'] = operation.headers['x-browser-device']
    if (operation.url?.includes('user=_open')) headers['x-user-name'] = '_open'
    req.headers = headers
    const res = new ServerResponse(req), chunks: Buffer[] = []
    res.assignSocket(new Duplex({ read() {}, write(chunk, _encoding, callback) { callback() } }) as any)
    res.write = ((chunk: any) => { chunks.push(Buffer.from(chunk)); return true }) as any
    return new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('业务处理超时')), 15000)
      res.end = ((chunk?: any) => {
        if (chunk) chunks.push(Buffer.from(chunk))
        clearTimeout(timer)
        const buffer = Buffer.concat(chunks), mime = String(res.getHeader('Content-Type') || '')
        if (mime.startsWith('image/')) { resolve({ status: res.statusCode, data: { binary: buffer.toString('base64'), mime } }); return res }
        const text = buffer.toString('utf8')
        let data: any; try { data = JSON.parse(text) } catch { data = text }
        resolve({ status: res.statusCode, data }); return res
      }) as any
      void this.dispatch(req, res).catch(error => { clearTimeout(timer); reject(error) })
      // 原控制器可能先异步读取其他数据再订阅正文，Readable 会保留尚未消费的内容。
      if (operation.data !== undefined) req.push(JSON.stringify(operation.data))
      req.push(null)
    })
  }

  /** 登录快照一次装载；后续只推送改变的条目。 */
  async snapshot(req: IncomingMessage) {
    const entries: Record<string, Result> = {}
    for (const route of bootstrapRoutes) entries[route] = await this.invoke(req, { url: route })
    return entries
  }

  /** 同账号串行应用批次，部分失败只保留失败项；每个操作再次经过原接口权限检查。 */
  async report(req: IncomingMessage, message: any) {
    const owner = this.authenticate(req)
    if (!owner) throw new Error('会话已失效')
    if (!Array.isArray(message.operations) || message.operations.length > 512) throw new Error('批次格式错误')
    const work = (this.serial.get(owner) || Promise.resolve()).catch(() => {}).then(async () => {
      const results: Record<string, Result> = {}
      for (const operation of message.operations as ClientOperation[]) {
        const parsed = new URL(operation.url || '', 'http://localhost')
        if (parsed.origin !== 'http://localhost' || writable.get(parsed.pathname) !== operation.method || !/^[\w:.-]{1,160}$/.test(operation.id || '') || [...parsed.searchParams.keys()].some(key => key !== 'user') || (parsed.search && parsed.search !== '?user=_open')) {
          results[operation.id || 'invalid'] = { status: 400, data: { message: '不允许的上报操作' } }; continue
        }
        const key = owner + ':' + operation.id
        const saved = this.completed.get(key)
        if (saved && Date.now() - saved.time < 86400000) { results[operation.id] = saved.result; continue }
        try {
          let data = operation.data
          if (operation.patch) {
            if (!patchable.has(parsed.pathname)) throw new Error('此接口不支持字段补丁')
            const current = await this.invoke(req, { url: operation.url, headers: operation.headers })
            if (current.status !== 200) { results[operation.id] = current; continue }
            data = mergeClientPatch(current.data, operation.data)
          }
          let result = await this.invoke(req, { ...operation, data })
          if (result.status >= 200 && result.status < 300 && (operation.channel || operation.eventId)) result = { status: result.status, data: { success: true } }
          results[operation.id] = result
          if (result.status >= 200 && result.status < 300) this.completed.set(key, { time: Date.now(), result })
        } catch (error: any) { results[operation.id] = { status: 500, data: { message: error.message } } }
      }
      for (const [key, item] of this.completed) if (Date.now() - item.time > 86400000) this.completed.delete(key)
      while (this.completed.size > 4096) this.completed.delete(this.completed.keys().next().value!)
      for (const operation of message.operations) if (results[operation.id]?.status < 300) this.notify(operation.url, operation.headers?.['x-user-name'] === '_open' || operation.url.includes('?user=_open') ? '_open' : owner)
      return { type: 'ack', id: message.id, results }
    })
    this.serial.set(owner, work)
    try { return await work } finally { if (this.serial.get(owner) === work) this.serial.delete(owner) }
  }

  /** 通过首次消息提交令牌，令牌不放 URL；之后每条消息验证当前会话。 */
  connect(socket: WebSocket, req: IncomingMessage) {
    let ready = false, chain = Promise.resolve()
    let upstream: WebSocket | undefined
    const forward: string[] = []
    const authTimeout = setTimeout(() => socket.close(4401, '请登录'), 10000)
    socket.on('message', raw => {
      chain = chain.then(async () => {
        const message = JSON.parse(raw.toString())
        if (!ready) {
          if (message.type !== 'hello') { socket.close(4401); return }
          if (typeof message.token === 'string') req.headers['x-user-token'] = message.token
          const owner = this.authenticate(req)
          if (!owner) { socket.close(4401); return }
          req.headers['x-user-name'] = owner
          if (typeof message.device === 'string') req.headers['x-browser-device'] = message.device
          ready = true; clearTimeout(authTimeout)
          const remote = this.remoteSession?.(req)
          if (remote?.remoteUrl) {
            const address = new URL('/api/music/client-channel', remote.remoteUrl)
            address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'
            upstream = new WebSocket(address)
            upstream.on('open', () => { upstream!.send(JSON.stringify({ ...message, token: remote.remoteToken })); for (const item of forward.splice(0)) upstream!.send(item) })
            upstream.on('message', data => { if (socket.readyState === WebSocket.OPEN) socket.send(data.toString()) })
            upstream.on('close', code => { if (socket.readyState === WebSocket.OPEN) socket.close(code === 4401 ? 4401 : 1012) })
            upstream.on('error', () => socket.close(1012))
            return
          }
          const versions = Object.entries(message.versions || {}).filter(([route, version]) => bootstrapRoutes.includes(route) && typeof version === 'string' && /^[a-f0-9]{64}$/.test(version)) as Array<[string, string]>
          this.clients.set(socket, { req, subscriptions: new Set(), signatures: new Map(versions), dirty: new Set(bootstrapRoutes) })
          socket.send(JSON.stringify({ type: 'ready' }))
          // 重连期间可能错过事件，连接建立后由服务端主动补齐快照。
          await this.pushSnapshot(socket); return
        }
        if (!this.authenticate(req)) { socket.close(4401); return }
        if (upstream) { if (upstream.readyState === WebSocket.OPEN) upstream.send(raw.toString()); else forward.push(raw.toString()); return }
        if (message.type === 'report') socket.send(JSON.stringify(await this.report(req, message)))
        else if (message.type === 'subscribe' && ['downloads', 'sync-download', 'maintenance', 'remaster'].includes(message.topic)) {
          const client = this.clients.get(socket)!
          if (message.topic === 'remaster') { client.remasterOffset = 0; client.remasterId = ''; client.signatures.delete('remaster') }
          if (message.enabled) client.subscriptions.add(message.topic); else { client.subscriptions.delete(message.topic); client.signatures.delete(message.topic) }
        }
      }).catch(error => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'error', message: error.message })) })
    })
    socket.on('close', () => { upstream?.terminate(); clearTimeout(authTimeout); clearTimeout(this.clients.get(socket)?.timer); this.clients.delete(socket) })
  }

  /** 将业务进度转发给所属账号及设备，不向其他账号广播。 */
  publish(owner: string, type: string, data: unknown, device?: string) {
    for (const [socket, client] of this.clients) {
      if (socket.readyState !== WebSocket.OPEN || this.authenticate(client.req) !== owner) continue
      if (device && client.req.headers['x-browser-device'] !== device) continue
      socket.send(JSON.stringify({ type, data }))
    }
  }

  /** 按原始写入路径选取相关缓存，播放进度不会引发整库读取。 */
  notify(value: string, affectedOwner?: string) {
    const groups: string[] = []
    if (/settings|soundEffects|appearance|experience/i.test(value)) groups.push('settings', 'sound-effects', 'appearance', 'sync-download/status')
    if (/list|playlist|love|favorite/i.test(value)) groups.push('/api/user/list', 'sync-download/status')
    if (/recent|play-count/i.test(value)) groups.push('recent', 'roaming/weights')
    if (/cache|custom|download|library|index/i.test(value) && !/storage|sync-download\/settings|playback/i.test(value)) groups.push('cache/list', 'custom/list', 'cache/directories', 'cache/subdirs', 'library/artists', 'library/albums')
    if (/dislike/i.test(value)) groups.push('dislike')
    if (/account|config/i.test(value)) groups.push('/api/user/account', '/api/music/config', '/api/user/token/config')
    if (/storage\/playback|storage\/queue/i.test(value)) groups.push(value.split('?')[0])
    const routes = bootstrapRoutes.filter(route => groups.some(group => route.includes(group)))
    if (routes.length) {
      // 账号文档通知只读取所属账号；公共资料变化只更新公共条目。
      if (!affectedOwner && this.userDirectory && !value.startsWith('/api/')) {
        const normalized = value.replace(/\\/g, '/')
        if (normalized.startsWith(this.userDirectory('_open').replace(/\\/g, '/') + '/')) affectedOwner = '_open'
        else for (const client of this.clients.values()) {
          const name = this.authenticate(client.req)
          if (name && normalized.startsWith(this.userDirectory(name).replace(/\\/g, '/') + '/')) { affectedOwner = name; break }
        }
        if (!affectedOwner && normalized.startsWith(global.lx.userPath.replace(/\\/g, '/') + '/')) return
      }
      this.changed(routes, affectedOwner)
    }
  }
  private changed = (value?: string | string[], affectedOwner?: string) => {
    if (typeof value === 'string') { this.notify(value.replace(/\\/g, '/')); return }
    for (const [socket, client] of this.clients) {
      const owner = this.authenticate(client.req)
      if (affectedOwner && affectedOwner !== '_open' && owner !== affectedOwner) continue
      for (const route of value || bootstrapRoutes) {
        if (affectedOwner === '_open' && owner !== '_open' && !route.includes('user=_open')) continue
        if (affectedOwner && affectedOwner !== '_open' && route.includes('user=_open')) continue
        client.dirty.add(route)
      }
      if (client.dirty.size && !client.timer) client.timer = setTimeout(() => { client.timer = undefined; void this.pushSnapshot(socket).catch(() => {}) }, 500)
    }
  }
  private async pushSnapshot(socket: WebSocket) {
    const client = this.clients.get(socket)
    if (!client || socket.readyState !== WebSocket.OPEN || client.pushing) return
    if (!this.authenticate(client.req)) { socket.close(4401); return }
    client.pushing = true
    const routes = client.signatures.size ? [...client.dirty] : bootstrapRoutes
    client.dirty.clear()
    const entries: Record<string, Result> = {}, changed: Record<string, Result> = {}
    try { for (const route of routes) entries[route] = await this.invoke(client.req, { url: route }) }
    finally { client.pushing = false }
    for (const [route, result] of Object.entries(entries)) {
      const version = signature(result)
      if (client.signatures.get(route) !== version) { changed[route] = result; client.signatures.set(route, version) }
    }
    if (Object.keys(changed).length && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cache', entries: changed, versions: cacheVersions(changed) }))
    if (client.dirty.size && !client.timer) client.timer = setTimeout(() => { client.timer = undefined; void this.pushSnapshot(socket).catch(() => {}) }, 500)
  }
  private async progress() {
    if (this.progressing) return
    this.progressing = true
    try {
    for (const [socket, client] of this.clients) {
      if (!client.subscriptions.size) continue
      if (!this.authenticate(client.req)) { socket.close(4401); continue }
      for (const topic of client.subscriptions) {
        const routes = topic === 'downloads' ? ['/api/music/cache/queue'] : topic === 'sync-download' ? ['/api/user/sync-download/progress'] : topic === 'remaster' ? ['/api/music/remaster/status?offset=' + (client.remasterOffset || 0) + '&limit=200'] : ['/api/music/maintenance', '/api/music/library/scan']
        const values = await Promise.all(routes.map(url => this.invoke(client.req, { url })))
        let data = topic === 'maintenance' ? { tasks: values[0].data.tasks || [], scan: values[1].data.scan || values[1].data } : values[0].data
        if (topic === 'remaster' && data.success) {
          if (client.remasterId && client.remasterId !== data.data.id) data = (await this.invoke(client.req, { url: '/api/music/remaster/status?offset=0&limit=200' })).data
          client.remasterId = data.data.id; client.remasterOffset = data.data.nextOffset || 0
        }
        const signature = JSON.stringify(data)
        if (client.signatures.get(topic) === signature || socket.readyState !== WebSocket.OPEN) continue
        client.signatures.set(topic, signature); socket.send(JSON.stringify({ type: topic, data }))
      }
    }
    } finally { this.progressing = false }
  }
  close() { clearInterval(this.progressTimer); storageEvents.off('change', this.changed); for (const socket of this.sockets.clients) socket.terminate(); this.sockets.close() }
}
