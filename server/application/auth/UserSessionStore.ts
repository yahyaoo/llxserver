import crypto from 'node:crypto'
import { repositories } from '../persistence/storage'
import type { LoginSessionRecord } from '../../admin/repository/AdminRepository'

export const USER_SESSION_COOKIE = 'lx_user_session'
export const ADMIN_SESSION_COOKIE = 'lx_admin_session'
export const ADMIN_USERNAME = '\u0000admin'
const sessionUser = (username: string) => username === ADMIN_USERNAME ? { name: ADMIN_USERNAME, password: global.lx.config['frontend.password'] } : global.lx.config.users.find(user => user.name === username)
const DAY = 86400000
/** 登录会话；普通会话只在内存保留，记住我的会话进入管理数据库。 */
export interface UserSession {
  username: string
  createdAt: number
  expiresAt: number
  rememberMe: boolean
  credentialHash?: string
  remoteUrl?: string
  remoteToken?: string
}
/** @param config 服务配置。@param remember 是否记住登录。@returns 有效期毫秒，非法启动配置回退安全默认值。 */
export function sessionTTL(config: LX.Config, remember: boolean): number {
  const value = Number(config[remember ? 'auth.rememberMeDays' : 'auth.sessionDays'])
  return (Number.isInteger(value) && value >= 1 && value <= 365 ? value : remember ? 30 : 1) * DAY
}
/** @param value 待摘要内容。@returns SHA-256 摘要。 */
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
/** @param username 账号。@param password 密码。@returns 凭据摘要，用于即时检测账号删除或密码变更。 */
export const credentialDigest = (username: string, password: string) => digest(JSON.stringify([username, password]))
/** 管理本地及远程登录，持久会话不依赖服务进程内存。 */
export class UserSessionStore {
  private memory = new Map<string, UserSession>()
  /** @param token 浏览器随机令牌。@param session 已验证的登录信息。 */
  set(token: string, session: UserSession): void {
    if (!session.remoteUrl) {
      const user = sessionUser(session.username)
      if (!user || typeof user.password !== 'string') throw new Error('账号不存在或密码未配置')
      session.credentialHash = credentialDigest(user.name, user.password)
    }
    if (!session.rememberMe) { this.memory.set(token, session); return }
    let encrypted: string | undefined
    if (session.remoteToken) {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(token).digest(), iv)
      const body = Buffer.concat([cipher.update(session.remoteToken, 'utf8'), cipher.final()])
      encrypted = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
    }
    const record: LoginSessionRecord = { tokenHash: digest(token), username: session.username, createdAt: session.createdAt, expiresAt: session.expiresAt, credentialHash: session.credentialHash || '', remoteUrl: session.remoteUrl, remoteToken: encrypted }
    repositories().admin.saveLoginSession(record)
  }
  /** @param token 浏览器令牌。@returns 未到期且账号仍有效的会话。 */
  get(token: string): UserSession | undefined {
    let session = this.memory.get(token)
    if (!session) {
      const row = repositories().admin.readLoginSession(digest(token))
      if (!row) return
      session = { ...row, rememberMe: true }
      if (row.remoteToken) {
        try {
          const encrypted = Buffer.from(row.remoteToken, 'base64'), decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(token).digest(), encrypted.subarray(0, 12))
          decipher.setAuthTag(encrypted.subarray(12, 28))
          session.remoteToken = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString('utf8')
        } catch { this.delete(token); return }
      }
    }
    const deadline = Math.min(session.expiresAt, session.createdAt + sessionTTL(global.lx.config, session.rememberMe))
    const user = sessionUser(session.username)
    if (Date.now() >= deadline || (!session.remoteUrl && (!user || typeof user.password !== 'string' || session.credentialHash !== credentialDigest(user.name, user.password)))) { this.delete(token); return }
    return { ...session, expiresAt: deadline }
  }
  /** @param token 待撤销令牌。 */
  delete(token: string): void { this.memory.delete(token); repositories().admin.deleteLoginSession(digest(token)) }
  /** 删除账号时撤销所有本地凭据，防止账号同名重建后恢复旧登录。 */
  revokeUser(username: string): void {
    for (const [token, session] of this.memory) if (!session.remoteUrl && session.username === username) this.memory.delete(token)
    repositories().admin.revokeAccountCredentials(username)
  }
  /** 删除内存与数据库中的到期会话。 */
  prune(): void {
    for (const [token, session] of this.memory) if (Date.now() >= session.expiresAt) this.memory.delete(token)
    repositories().admin.pruneLoginSessions(Date.now())
  }
}
