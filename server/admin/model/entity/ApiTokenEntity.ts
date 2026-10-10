/** 对应 server_api_token 表的用户关联 API 令牌持久记录，认证使用摘要，原值使用加密内容。 */
export interface ApiTokenRecord {
  tokenHash: string
  tokenEncrypted: string
  username: string
  name: string
  createdAt: number
  expiresAt: number | null
  lastUsed?: number
  disabled?: boolean
}
