import type { RequestContext } from '../../common/http/RequestContext'
import type { PlaylistServiceRuntime } from './PlaylistService'
import { songIdentity } from './library/SongIdentity'

/** 同账号喜欢操作串行提交，避免快速连点或并发请求丢失更新。 @author jingyh */
const pending = new WeakMap<object, Promise<unknown>>()

/** 独立喜爱接口；只信任验证后的账号，公开写入仍要求管理员。 @author jingyh */
export async function handleFavorites(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res, urlObj } = context
  const respond = (status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  const verified = runtime.verifyUserAuth(req)
  const requested = urlObj.searchParams.get('user') || req.headers['x-user-name'] || ''
  const publicRequest = requested === '_open' || requested === 'default' || (!requested && !verified && !req.headers['x-user-token'])
  const admin = !!global.lx.config['frontend.password'] && req.headers['x-frontend-auth'] === global.lx.config['frontend.password']
  let username = verified
  if (publicRequest) {
    if (!global.lx.config['user.enablePublicFavorites'] || (!global.lx.config['user.enablePublicNonAdminAccess'] && !admin && !verified) || (req.method === 'POST' && !admin)) {
      respond(403, { success: false, error: '公共喜爱访问权限不足' }); return
    }
    username = '_open'
  }
  if (!username || (!publicRequest && requested && requested !== username)) {
    respond(401, { success: false, error: '需要当前账号认证' }); return
  }
  try {
    const manager = runtime.getUserSpace(username).listManage
    await manager.listDataManage.initPromise
    if (req.method === 'GET') {
      respond(200, { success: true, items: (await manager.getListData()).loveList }); return
    }
    const input = JSON.parse(await runtime.readBody(req))
    const validSong = (song: any) => song && typeof song.id === 'string' && song.id.trim() && typeof song.name === 'string'
    const validChange = (change: any) => change && typeof change.loved === 'boolean' && validSong(change.song)
    const changes = Array.isArray(input?.changes) ? input.changes : [input]
    if (!input || changes.length > 10000 || !changes.every(validChange)) {
      respond(400, { success: false, error: '需要合法歌曲和喜欢状态' }); return
    }
    const work = (pending.get(manager) || Promise.resolve()).catch(() => {}).then(async () => {
      // 批量请求逐项复用原增删规则，只写实际变化，保留其他设备的喜欢。 @author jingyh
      let changed = false
      for (const change of changes) {
        const existing = (await manager.getListData()).loveList.filter(song => songIdentity().key(song) === songIdentity().key(change.song))
        if (change.loved) {
          const location = change.location === 'top' || change.location === 'bottom' ? change.location : runtime.getUserConfig(username!)['list.addMusicLocationType']
          if (!existing.length) { await manager.listDataManage.listMusicAdd('love', [change.song], location); changed = true }
        } else if (existing.length) { await manager.listDataManage.listMusicRemove('love', existing.map(song => song.id)); changed = true }
      }
      if (changed) await manager.createSnapshot()
      return (await manager.getListData()).loveList
    })
    pending.set(manager, work)
    try { respond(200, { success: true, items: await work }) }
    finally { if (pending.get(manager) === work) pending.delete(manager) }
  } catch (error: any) {
    respond(error instanceof SyntaxError ? 400 : 500, { success: false, error: error.message || '保存喜欢失败' })
  }
}
