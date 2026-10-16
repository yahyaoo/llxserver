import { IncomingMessage, ServerResponse, type IncomingHttpHeaders } from 'node:http'
import { Duplex } from 'node:stream'
import { createHash, randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { storageEvents } from '../persistence/storage'
import { serverEvents, type ServerEventMap } from '../events/ServerEvents'

/** 客户端统一消息协议，沿用原接口鉴权和业务处理。 @author jingyh @date 2026-10-12 */
export interface ClientOperation { id: string; url: string; method: string; data?: any; headers?: Record<string, string>; patch?: boolean; channel?: string; eventId?: string }
type Dispatch = (req: IncomingMessage, res: ServerResponse) => Promise<void>
type Result = { status: number; data: any }
type TopicState = { revision: number; sent: number; lastSent: number; timer?: NodeJS.Timeout; legacyTimer?: NodeJS.Timeout; fetching?: boolean; urgent?: boolean }
type ChannelClient = { req: IncomingMessage; subscriptions: Set<string>; signatures: Map<string, string>; dirty: Set<string>; timer?: NodeJS.Timeout; pushing?: boolean; remasterOffset?: number; remasterId?: string; topics: Map<string, TopicState>; seq: number; progressThrottleMs: number }
const topicNames = new Set(['downloads', 'downloads:summary', 'sync-download', 'maintenance', 'remaster', 'library', 'notify'])
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
  private clients = new Map<WebSocket, ChannelClient>()
  readonly serverEpoch = randomUUID()
  private notifySeq = 0
  private notices = new Map<string, Array<{ seq: number; data: ServerEventMap['notify'] }>>()
  private noticeFloors = new Map<string, number>()
  private library = new Map<string, any>()
  private heartbeat?: NodeJS.Timeout
  private missedPongs = new Map<WebSocket, number>()
  private offEvents: Array<() => void> = []
  private closed = false
  private revision = 0
  private topicReads = new Map<string, Promise<any>>()
  private proxyProgress = new Map<string, Map<string, ServerEventMap['download:proxy-progress']['data']>>()
  constructor(private dispatch: Dispatch, private authenticate: (req: IncomingMessage) => string | null,
    private remoteSession?: (req: IncomingMessage) => { remoteUrl?: string; remoteToken?: string } | undefined,
    private userDirectory?: (username: string) => string) {
    storageEvents.on('change', this.changed)
    this.offEvents.push(
      serverEvents.onEvent('download:changed', event => this.invalidate(event.username, ['downloads', 'downloads:summary'], event.reason !== 'progress')),
      serverEvents.onEvent('task:changed', event => this.invalidate(event.username, [event.topic], event.reason === 'state')),
      serverEvents.onEvent('download:proxy-progress', event => {
        const progress = this.proxyProgress.get(event.username) || new Map()
        progress.set(event.taskId, event.data)
        while (progress.size > 200) progress.delete(progress.keys().next().value!)
        this.proxyProgress.set(event.username, progress)
        this.invalidate(event.username, ['downloads'], event.data.status !== 'downloading')
      }),
      serverEvents.onEvent('library:scan-started', event => {
        this.library.set(event.username, { ...this.library.get(event.username), scan: { running: true, reason: event.reason, startedAt: event.startedAt }, version: ++this.revision })
        this.invalidate(event.username, ['library', 'maintenance'], true)
      }),
      serverEvents.onEvent('library:scan-finished', event => {
        const count = event.added.length + event.changed.length + event.removed.length
        this.library.set(event.username, { ...this.library.get(event.username), scan: { running: false, total: event.total, added: event.added.length, changed: event.changed.length, removed: event.removed.length, durationMs: event.durationMs, error: event.error, errors: event.errors || [] }, changed: count > 0, version: ++this.revision })
        this.invalidate(event.username, ['library', 'maintenance'], true)
        if (count && !event.error) this.publishNotice({ username: event.username, id: randomUUID(), level: 'success', title: '音乐库扫描完成', message: `新增 ${event.added.length} 首，更新 ${event.changed.length} 首，移除 ${event.removed.length} 首`, createdAt: Date.now(), link: '#/local' })
      }),
      serverEvents.onEvent('library:prefetch-progress', event => {
        const previous = this.library.get(event.username)
        this.library.set(event.username, { ...previous, prefetch: { queued: event.queued, done: event.done, failed: event.failed, running: event.running }, version: ++this.revision })
        this.invalidate(event.username, ['library'], !event.running)
        if (!event.running && previous?.prefetch?.running) this.publishNotice({ username: event.username, id: randomUUID(), level: event.failed ? 'warn' : 'success', title: '封面与歌词预取完成', message: `完成 ${event.done}，失败 ${event.failed}`, createdAt: Date.now() })
      }),
      serverEvents.onEvent('notify', notice => this.publishNotice(notice)),
    )
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
      const results: Record<string, Result> = Object.create(null)
      for (const operation of message.operations as ClientOperation[]) {
        const parsed = new URL(operation.url || '', 'http://localhost')
        if (parsed.origin !== 'http://localhost' || writable.get(parsed.pathname) !== operation.method || !/^[\w:.-]{1,160}$/.test(operation.id || '') || ['__proto__', 'constructor', 'prototype'].includes(operation.id) || [...parsed.searchParams.keys()].some(key => key !== 'user') || (parsed.search && parsed.search !== '?user=_open')) {
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
      return { type: 'ack', id: message.id, results, confirmedPlaybackIds: message.operations
        .filter((operation: ClientOperation) => operation.url === '/api/user/recent' && results[operation.id]?.status >= 200 && results[operation.id]?.status < 300)
        .map((operation: ClientOperation) => operation.data?.playbackId).filter((id: unknown) => typeof id === 'string') }
    })
    this.serial.set(owner, work)
    try { return await work } finally { if (this.serial.get(owner) === work) this.serial.delete(owner) }
  }

  /** 通过首次消息提交令牌，令牌不放 URL；之后每条消息验证当前会话。 */
  connect(socket: WebSocket, req: IncomingMessage) {
    let ready = false, chain = Promise.resolve(), queuedMessages = 0, queuedBytes = 0
    let upstream: WebSocket | undefined
    const forward: string[] = []
    let forwardBytes = 0
    socket.on('error', () => {})
    this.missedPongs.set(socket, 0)
    socket.on('pong', () => this.missedPongs.set(socket, 0))
    // 通道实例拥有唯一协议心跳；最后一个连接关闭即停止。
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        for (const [peer, missed] of this.missedPongs) {
          if (missed >= 2) { peer.terminate(); continue }
          if (peer.readyState === WebSocket.OPEN) { this.missedPongs.set(peer, missed + 1); peer.ping() }
        }
      }, 30000)
      this.heartbeat.unref()
    }
    const authTimeout = setTimeout(() => socket.close(4401, '请登录'), 10000)
    socket.on('message', raw => {
      const text = raw.toString(), bytes = Buffer.byteLength(text)
      if (queuedMessages >= 64 || queuedBytes + bytes > 24 * 1024 * 1024) { socket.close(1013, '消息积压，请重连'); return }
      queuedMessages++; queuedBytes += bytes
      chain = chain.then(async () => {
        if (this.closed || socket.readyState !== WebSocket.OPEN) return
        const message = JSON.parse(text)
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
            upstream.on('open', () => { upstream!.send(JSON.stringify({ ...message, token: remote.remoteToken })); for (const item of forward.splice(0)) upstream!.send(item); forwardBytes = 0 })
            upstream.on('message', data => { if (socket.readyState === WebSocket.OPEN) { if (socket.bufferedAmount > 1024 * 1024) socket.close(1013); else socket.send(data.toString()) } })
            upstream.on('close', code => { if (socket.readyState === WebSocket.OPEN) socket.close(code === 4401 ? 4401 : 1012) })
            upstream.on('error', () => socket.close(1012))
            return
          }
          const versions = Object.entries(message.versions || {}).filter(([route, version]) => bootstrapRoutes.includes(route) && typeof version === 'string' && /^[a-f0-9]{64}$/.test(version)) as Array<[string, string]>
          const config = this.configuration()
          this.clients.set(socket, { req, subscriptions: new Set(['notify']), signatures: new Map(versions), dirty: new Set(bootstrapRoutes), topics: new Map(), seq: 0, progressThrottleMs: config.progressThrottleMs })
          const cursor = Number.isSafeInteger(message.lastNotifySeq) && message.lastNotifySeq >= 0 ? message.lastNotifySeq : 0
          const retained = this.availableNotices(owner)
          const sameEpoch = message.serverEpoch === this.serverEpoch && cursor <= this.notifySeq
          const resumeUnavailable = !!message.serverEpoch && (!sameEpoch || cursor < Math.max(this.noticeFloors.get(owner) || 0, this.noticeFloors.get('*') || 0))
          const replay = retained.filter(item => item.seq > (sameEpoch ? cursor : 0))
          this.send(socket, { type: 'ready', config, serverEpoch: this.serverEpoch, notifySeq: this.notifySeq,
            notifyRange: { first: retained[0]?.seq || this.notifySeq + 1, last: this.notifySeq }, resumeUnavailable: resumeUnavailable || replay.length > 50 })
          if (message.serverEpoch || message.lastNotifySeq !== undefined) for (const item of replay.slice(-50)) this.sendNotice(socket, item)
          // 重连期间可能错过事件，连接建立后由服务端主动补齐快照。
          await this.pushSnapshot(socket); return
        }
        if (!this.authenticate(req)) { socket.close(4401); return }
        if (upstream) {
          if (upstream.readyState === WebSocket.OPEN) { if (upstream.bufferedAmount > 1024 * 1024) socket.close(1013); else upstream.send(raw.toString()) }
          else { forwardBytes += raw.toString().length; if (forward.length >= 64 || forwardBytes > 24 * 1024 * 1024) socket.close(1013); else forward.push(raw.toString()) }
          return
        }
        if (message.type === 'report') this.send(socket, await this.report(req, message))
        else if (message.type === 'subscribe' && topicNames.has(message.topic)) {
          const client = this.clients.get(socket)!
          if (message.enabled) {
            if (client.subscriptions.has(message.topic)) return
            if (message.topic === 'remaster') { client.remasterOffset = 0; client.remasterId = '' }
            client.subscriptions.add(message.topic)
            this.markTopic(socket, message.topic, true)
          } else {
            client.subscriptions.delete(message.topic)
            clearTimeout(client.topics.get(message.topic)?.timer)
            clearTimeout(client.topics.get(message.topic)?.legacyTimer)
            client.topics.delete(message.topic)
          }
        }
      }).catch(error => { this.send(socket, { type: 'error', message: error.message }) })
        .finally(() => { queuedMessages--; queuedBytes -= bytes })
    })
    socket.on('close', () => {
      upstream?.terminate(); clearTimeout(authTimeout)
      const client = this.clients.get(socket)
      clearTimeout(client?.timer)
      for (const state of client?.topics.values() || []) { clearTimeout(state.timer); clearTimeout(state.legacyTimer) }
      this.clients.delete(socket); this.missedPongs.delete(socket)
      if (!this.missedPongs.size) { clearInterval(this.heartbeat); this.heartbeat = undefined }
    })
  }

  /** 将业务进度转发给所属账号及设备，不向其他账号广播。 */
  publish(owner: string, type: string, data: unknown, device?: string) {
    for (const [socket, client] of this.clients) {
      if (socket.readyState !== WebSocket.OPEN || this.authenticate(client.req) !== owner) continue
      if (device && client.req.headers['x-browser-device'] !== device) continue
      this.send(socket, { type, data })
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
    if (this.closed) return
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
    if (this.closed || this.clients.get(socket) !== client) return
    for (const [route, result] of Object.entries(entries)) {
      const version = signature(result)
      if (client.signatures.get(route) !== version) { changed[route] = result; client.signatures.set(route, version) }
    }
    if (Object.keys(changed).length) this.send(socket, { type: 'cache', entries: changed, versions: cacheVersions(changed) })
    if (client.dirty.size && !client.timer) client.timer = setTimeout(() => { client.timer = undefined; void this.pushSnapshot(socket).catch(() => {}) }, 500)
  }
  private configuration() {
    const number = (key: keyof LX.Config, fallback: number, min: number, max: number) => {
      const value = global.lx?.config?.[key]
      return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback
    }
    return { reportIntervalMs: number('clientChannel.reportIntervalMinutes', 30, 0, 1440) * 60000,
      progressThrottleMs: number('clientChannel.progressThrottleMs', 500, 200, 5000),
      maxBatchOps: number('clientChannel.maxBatchOps', 200, 1, 512), maxBatchBytes: number('clientChannel.maxBatchBytes', 262144, 1024, 1048576) }
  }
  /** 有界 socket 缓冲；慢连接重连重新取得快照，不累积无限进度消息。 */
  private send(socket: WebSocket, message: unknown) {
    if (this.closed || socket.readyState !== WebSocket.OPEN) return false
    if (socket.bufferedAmount > 1024 * 1024) { socket.close(1013, '请重连获取最新状态'); return false }
    socket.send(JSON.stringify(message)); return true
  }
  private availableNotices(owner: string) {
    return [...this.notices.get(owner) || [], ...(owner === '*' ? [] : this.notices.get('*') || [])].sort((a, b) => a.seq - b.seq)
  }
  /** 可信进程内事件可发布通知；浏览器消息没有公告发布入口。 */
  publishNotice(notice: ServerEventMap['notify']) {
    if (this.closed || !notice || typeof notice.username !== 'string' || !notice.username || typeof notice.title !== 'string') return
    const data = { ...notice, id: String(notice.id).slice(0, 160), title: notice.title.slice(0, 256), message: notice.message?.slice(0, 4096) }
    const item = { seq: ++this.notifySeq, data }, buffer = this.notices.get(notice.username) || []
    buffer.push(item)
    const limit = notice.username === '*' ? 50 : 100
    if (buffer.length > limit) this.noticeFloors.set(notice.username, buffer.shift()!.seq)
    this.notices.set(notice.username, buffer)
    for (const [socket, client] of this.clients) {
      const owner = this.authenticate(client.req)
      if (owner && client.subscriptions.has('notify') && (notice.username === '*' || notice.username === owner)) this.sendNotice(socket, item)
    }
  }
  private sendNotice(socket: WebSocket, item: { seq: number; data: ServerEventMap['notify'] }) {
    const { username: _owner, ...data } = item.data
    this.send(socket, { type: 'notify', seq: item.seq, serverEpoch: this.serverEpoch, data })
  }
  /** 监听器只标记 revision 和安排一次 timeout；空闲没有业务唤醒。 */
  private invalidate(owner: string, topics: string[], urgent: boolean) {
    if (this.closed) return
    for (const [socket, client] of this.clients) if (this.authenticate(client.req) === owner) {
      for (const topic of topics) if (client.subscriptions.has(topic)) this.markTopic(socket, topic, urgent)
    }
  }
  private markTopic(socket: WebSocket, topic: string, urgent: boolean) {
    if (topic === 'notify') return
    const client = this.clients.get(socket)
    if (!client) return
    let state = client.topics.get(topic)
    if (!state) { state = { revision: 0, sent: -1, lastSent: 0 }; client.topics.set(topic, state) }
    state.revision = ++this.revision
    state.urgent ||= urgent
    this.scheduleTopic(socket, topic, state)
  }
  private scheduleTopic(socket: WebSocket, topic: string, state: TopicState) {
    if (this.closed || socket.readyState !== WebSocket.OPEN || state.fetching || state.revision === state.sent) return
    if (state.timer && !state.urgent) return
    clearTimeout(state.timer)
    const delay = state.urgent ? 0 : Math.max(0, (this.clients.get(socket)?.progressThrottleMs || 500) - (Date.now() - state.lastSent))
    state.timer = setTimeout(() => { state.timer = undefined; void this.pushTopic(socket, topic, state) }, delay)
    state.timer.unref()
  }
  private async fetchTopic(client: ChannelClient, topic: string) {
    const read = async (url: string) => {
      // 同账号、设备及权限相同的并发读取共享；跨权限结果绝不复用。
      const key = JSON.stringify([this.authenticate(client.req), client.req.headers['x-browser-device'], client.req.headers['x-user-token'], client.req.headers['x-admin-token'], client.req.headers['x-frontend-auth'], client.req.headers.cookie, url, this.revision])
      let work = this.topicReads.get(key)
      if (!work) { work = this.invoke(client.req, { url }).then(result => result.data).finally(() => this.topicReads.delete(key)); this.topicReads.set(key, work) }
      return work
    }
    if (topic === 'downloads' || topic === 'downloads:summary') {
      const data = await read('/api/music/cache/queue')
      if (topic === 'downloads') return { ...data, proxyProgress: Object.fromEntries(this.proxyProgress.get(this.authenticate(client.req)!) || []) }
      const items = Array.isArray(data.data) ? data.data : []
      return { active: items.filter((item: any) => ['downloading', 'tagging'].includes(item.status)).length,
        queued: items.filter((item: any) => item.status === 'waiting').length,
        speed: items.reduce((sum: number, item: any) => sum + (item.status === 'downloading' ? Number(item.speed) || 0 : 0), 0) }
    }
    if (topic === 'sync-download') return read('/api/user/sync-download/progress')
    if (topic === 'remaster') {
      let data = await read('/api/music/remaster/status?offset=' + (client.remasterOffset || 0) + '&limit=200')
      if (data.success && client.remasterId && client.remasterId !== data.data.id) data = await read('/api/music/remaster/status?offset=0&limit=200')
      return data
    }
    const owner = this.authenticate(client.req)!, remembered = this.library.get(owner)
    if (topic === 'library' && remembered) return remembered
    const scan = await read('/api/music/library/scan')
    if (topic === 'maintenance') return { tasks: (await read('/api/music/maintenance')).tasks || [], scan: scan.scan || scan }
    // 启动快照只取状态标量，不广播索引或扫描路径。
    const status = scan.scan || scan.data || scan
    return { scan: Object.fromEntries(['running', 'total', 'processed', 'startedAt', 'finishedAt', 'error', 'errors', 'reason'].filter(key => status[key] !== undefined).map(key => [key, status[key]])),
      prefetch: { queued: 0, done: 0, failed: 0, running: false }, version: 0 }
  }
  private async pushTopic(socket: WebSocket, topic: string, state: TopicState) {
    const client = this.clients.get(socket)
    if (!client || !client.subscriptions.has(topic) || state.fetching || this.closed) return
    if (!this.authenticate(client.req)) { socket.close(4401); return }
    const revision = state.revision
    state.fetching = true; state.urgent = false
    try {
      const data = await this.fetchTopic(client, topic)
      if (this.closed || client.topics.get(topic) !== state || !client.subscriptions.has(topic)) return
      if (!this.authenticate(client.req)) { socket.close(4401); return }
      // 在途旧订阅快照不能覆盖新事件；下一次读取最新 revision。
      if (state.revision !== revision) return
      if (this.send(socket, { type: topic, seq: ++client.seq, data })) { state.sent = revision; state.lastSent = Date.now() }
      if (topic === 'remaster' && data.success) {
        client.remasterId = data.data.id; client.remasterOffset = data.data.nextOffset || 0
        if (data.data.nextOffset < data.data.processed) this.markTopic(socket, topic, true)
      }
      clearTimeout(state.legacyTimer)
      const active = topic === 'downloads' ? data.data?.some((item: any) => ['waiting', 'downloading', 'tagging'].includes(item.status))
        : topic === 'downloads:summary' ? data.active + data.queued > 0 : topic === 'sync-download' ? data.data?.isRunning
          : topic === 'remaster' ? data.data?.status === 'running' : data.tasks?.some((task: any) => task.status === 'running') || data.scan?.running
      // 显式回退开关，只有当前订阅快照显示活动任务才续约一次采样。
      if (global.lx?.config?.['clientChannel.legacyProgressPolling'] && active) {
        state.legacyTimer = setTimeout(() => { state.legacyTimer = undefined; this.markTopic(socket, topic, false) }, 1000)
        state.legacyTimer.unref()
      }
    } catch { state.sent = revision /* 路由错误不创建空闲重试循环；下次事件/重订阅重试。 */ }
    finally { state.fetching = false; if (client.topics.get(topic) === state) this.scheduleTopic(socket, topic, state) }
  }
  close() {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeat); this.heartbeat = undefined
    storageEvents.off('change', this.changed)
    for (const off of this.offEvents.splice(0)) off()
    for (const [socket, client] of this.clients) {
      clearTimeout(client.timer); for (const state of client.topics.values()) { clearTimeout(state.timer); clearTimeout(state.legacyTimer) }
      socket.terminate()
    }
    for (const socket of this.missedPongs.keys()) socket.terminate()
    this.clients.clear(); this.missedPongs.clear(); this.library.clear(); this.notices.clear(); this.noticeFloors.clear(); this.proxyProgress.clear()
    this.sockets.close()
  }
}
