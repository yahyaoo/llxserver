import crypto from 'node:crypto'
import path from 'node:path'
import { repositories } from '../persistence/storage'
import storageFs from '../persistence/documentFileSystem'
import { credentialDigest } from './UserSessionStore'
import { File } from '../../constants'
import type { UserToken } from '../../common/model/dto/UserTokenDto'

export interface ApiTokenConfig { enabled: boolean, tokens: UserToken[] }
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
/** 令牌原值以账号凭据派生密钥加密；改密后旧令牌自动失效。 */
function key(username: string): Buffer {
  const user = global.lx.config.users.find(user => user.name === username)
  if (!user) throw new Error('账号不存在')
  return Buffer.from(credentialDigest(user.name, user.password), 'hex')
}
function encrypt(token: string, username: string): string {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(username), iv)
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64')
}
function decrypt(encrypted: string, username: string): string {
  const bytes = Buffer.from(encrypted, 'base64'), decipher = crypto.createDecipheriv('aes-256-gcm', key(username), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(-16))
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8')
}
/** 数据库为令牌配置唯一写入位置；仅首次读取兼容迁移旧 JSON。 */
export class ApiTokenStore {
  constructor(private readonly userDirectory: (username: string) => string) {}
  get(username: string): ApiTokenConfig {
    const repository = repositories().admin
    let enabled = repository.readApiTokenEnabled(username)
    if (enabled === undefined) {
      const filename = path.join(global.lx.userPath, this.userDirectory(username), File.userTokensJSON)
      let config: ApiTokenConfig = { enabled: false, tokens: [] }
      if (storageFs.existsSync(filename)) {
        try {
          const legacy = JSON.parse(storageFs.readFileSync(filename, 'utf8'))
          if (!legacy || !Array.isArray(legacy.tokens)) return config
          config = { enabled: !!legacy.enabled, tokens: legacy.tokens }
        } catch { return config }

      }
      try { this.save(username, config) } catch { return { enabled: false, tokens: [] } }
      enabled = config.enabled
    }
    const tokens: UserToken[] = []
    for (const row of repository.readApiTokens(username)) {
      try { tokens.push({ token: decrypt(row.tokenEncrypted, username), name: row.name, createdAt: row.createdAt, expiresAt: row.expiresAt, lastUsed: row.lastUsed ?? undefined, disabled: !!row.disabled }) }
      catch { /* 已修改密码的旧令牌不再展示或接受认证。 */ }
    }
    return { enabled, tokens }
  }
  save(username: string, config: ApiTokenConfig): void {
    const rows = config.tokens.map(token => {
      if (typeof token.token !== 'string' || !/^lx_tk_[A-Za-z0-9_-]{1,128}$/.test(token.token) || typeof token.name !== 'string' || token.name.length > 100 ||
          !Number.isFinite(token.createdAt) || (token.expiresAt != null && (!Number.isFinite(token.expiresAt) || token.expiresAt < 0))) throw new Error('Token 名称最多 100 字，有效期必须是合法时间')
      return { ...token, username, tokenHash: hash(token.token), tokenEncrypted: encrypt(token.token, username) }
    })
    repositories().admin.saveApiTokens(username, !!config.enabled, rows)
  }
  /** 每次认证读取当前数据库，禁用、删除、迁库与重启都不依赖缓存。 */
  verify(token: string): string | null {
    if (!/^lx_tk_[A-Za-z0-9_-]{1,128}$/.test(token)) return null
    for (const user of global.lx.config.users) if (repositories().admin.readApiTokenEnabled(user.name) === undefined) {
      try { this.get(user.name) } catch { /* 旧文件损坏不影响其他账号的认证，也不覆盖原文件。 */ }
    }
    const now = Date.now(), row = repositories().admin.findApiToken(hash(token), now)
    if (!row || !global.lx.config.users.some(user => user.name === row.username)) return null
    try { if (decrypt(row.tokenEncrypted, row.username) !== token) return null } catch { return null }
    if (!row.lastUsed || now - row.lastUsed >= 10000) repositories().admin.touchApiToken(row.tokenHash, now)
    return row.username
  }
}
