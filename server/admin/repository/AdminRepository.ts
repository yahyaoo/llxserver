import type { ApiTokenRecord } from '../model/entity/ApiTokenEntity'
import fs from 'node:fs'
import path from 'node:path'
import { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import { adminTables } from './catalog'
import type { LoginSessionEntity } from '../model/entity/LoginSessionEntity'
import type { LoginSessionDto } from '../model/dto/LoginSessionDto'
export type LoginSessionRecord = LoginSessionEntity
/** 管理域登录会话仓储，随数据库迁移交换连接。 */
export class AdminRepository extends SqliteDocumentRepository {

  /** 读取账号令牌总开关；空值表示尚未迁移旧数据。 */
  readApiTokenEnabled(username: string): boolean | undefined {
    const row = this.database.prepare('SELECT enabled FROM server_api_token_account WHERE username = ?').get(username)
    return row ? !!row.enabled : undefined
  }
  /** 读取账号的所有令牌，保留禁用与到期记录供用户管理。 */
  readApiTokens(username: string): ApiTokenRecord[] {
    return this.database.prepare('SELECT token_hash AS tokenHash, token_encrypted AS tokenEncrypted, username, name, created_at AS createdAt, expires_at AS expiresAt, last_used AS lastUsed, disabled FROM server_api_token WHERE username = ? ORDER BY created_at, rowid').all(username)
  }
  /** 在同一事务内替换账号配置，新增、删除和总开关即时生效。 */
  saveApiTokens(username: string, enabled: boolean, tokens: ApiTokenRecord[]): void {
    this.transaction(() => {
      this.database.prepare('INSERT INTO server_api_token_account (username, enabled) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET enabled = excluded.enabled').run(username, Number(enabled))
      this.database.prepare('DELETE FROM server_api_token WHERE username = ?').run(username)
      const insert = this.database.prepare('INSERT INTO server_api_token (token_hash, username, token_encrypted, name, created_at, expires_at, last_used, disabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      for (const token of tokens) insert.run(token.tokenHash, username, token.tokenEncrypted, token.name, token.createdAt, token.expiresAt ?? null, token.lastUsed ?? null, Number(!!token.disabled))
    })
  }
  /** 按摘要查找有效令牌。 */
  findApiToken(hash: string, now: number): ApiTokenRecord | undefined {
    return this.database.prepare('SELECT t.token_hash AS tokenHash, t.token_encrypted AS tokenEncrypted, t.username, t.name, t.created_at AS createdAt, t.expires_at AS expiresAt, t.last_used AS lastUsed, t.disabled FROM server_api_token t JOIN server_api_token_account a ON a.username = t.username WHERE t.token_hash = ? AND a.enabled = 1 AND t.disabled = 0 AND (t.expires_at IS NULL OR t.expires_at > ?)').get(hash, now)
  }
  /** 删除账号后保留禁用标记，防止同名重建时导入旧令牌。 */
  revokeAccountCredentials(username: string): void {
    this.transaction(() => {
      this.database.prepare('INSERT INTO server_api_token_account (username, enabled) VALUES (?, 0) ON CONFLICT(username) DO UPDATE SET enabled = 0').run(username)
      this.database.prepare('DELETE FROM server_api_token WHERE username = ?').run(username)
      this.database.prepare('DELETE FROM server_login_session WHERE username = ? AND remote_url IS NULL').run(username)
    })
  }
  /** 记录令牌最近访问时间。 */
  touchApiToken(hash: string, now: number): void {
    this.database.prepare('UPDATE server_api_token SET last_used = ? WHERE token_hash = ?').run(now, hash)
  }
  /** @param record 会话记录。使用参数绑定写入，禁止存储明文登录密码。 */
  saveLoginSession(record: LoginSessionDto): void {
    this.database.prepare('INSERT OR REPLACE INTO server_login_session (token_hash, username, created_at, expires_at, credential_hash, remote_url, remote_token) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(record.tokenHash, record.username, record.createdAt, record.expiresAt, record.credentialHash, record.remoteUrl || null, record.remoteToken || null)
  }
  /** @param hash 令牌摘要。@returns 持久会话或空值。 */
  readLoginSession(hash: string): LoginSessionRecord | undefined {
    return this.database.prepare('SELECT token_hash AS tokenHash, username, created_at AS createdAt, expires_at AS expiresAt, credential_hash AS credentialHash, remote_url AS remoteUrl, remote_token AS remoteToken FROM server_login_session WHERE token_hash = ?').get(hash)
  }
  /** @param hash 待撤销的令牌摘要。 */
  deleteLoginSession(hash: string): void { this.database.prepare('DELETE FROM server_login_session WHERE token_hash = ?').run(hash) }
  /** @param now 当前时间，删除到期会话。 */
  pruneLoginSessions(now: number): void { this.database.prepare('DELETE FROM server_login_session WHERE expires_at <= ?').run(now) }
}
/** 管理服务独立数据库工厂，不读取其他域的表。 @author yahyaoo */
export function createAdminRepository(dataPath: string, filename = path.join(dataPath, 'database/admin.sqlite')): AdminRepository {
  const bundled = path.join(__dirname, '../../sql/admin/001_initial.sql')
  const source = path.join(__dirname, '../../../sql/admin/001_initial.sql')
  const schema = fs.readFileSync(fs.existsSync(bundled) ? bundled : source, 'utf8')
  return new AdminRepository(filename, schema, adminTables, dataPath, 'server_storage_document')
}

