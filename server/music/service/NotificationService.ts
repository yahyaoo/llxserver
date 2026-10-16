import { repositories } from '../../application/persistence/storage'
import { serverEvents } from '../../application/events/ServerEvents'

/** 消息中心服务：持久化账号消息，已读即删除；实时推送仍由客户端通道负责。 @author jingyh */
const levels = new Set(['info', 'success', 'warn', 'error'])

/** 监听可信进程内的通知事件并落库；广播消息没有固定接收人，只实时推送不入库。 */
export function startNotificationPersistence(): () => void {
  return serverEvents.onEvent('notify', notice => {
    if (!notice || notice.username === '*' || notice.username === '_open' || typeof notice.username !== 'string' || typeof notice.title !== 'string') return
    try {
      repositories().music.addNotification(notice.username, {
        id: String(notice.id).slice(0, 160), level: levels.has(notice.level) ? notice.level : 'info', title: notice.title.slice(0, 256),
        message: notice.message?.slice(0, 4096), link: notice.link?.slice(0, 512), createdAt: Number(notice.createdAt) || Date.now(),
      })
    } catch (error) { console.error('[消息中心] 保存失败', error) }
  })
}

/** @returns 账号的未读消息。 */
export function listNotifications(username: string) { return repositories().music.listNotifications(username) }

/** 标记已读并删除；未传标识时处理账号全部消息。 */
export function readNotifications(username: string, ids?: unknown): number {
  if (ids === undefined) return repositories().music.deleteNotifications(username)
  if (!Array.isArray(ids)) throw new Error('消息标识必须是数组')
  return repositories().music.deleteNotifications(username, ids.filter((id): id is string => typeof id === 'string').slice(0, 200))
}