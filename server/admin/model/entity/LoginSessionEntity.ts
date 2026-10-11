/** 登录会话实体，对应 server_login_session 表；时间均为 Unix 毫秒。 */
export interface LoginSessionEntity {
  /** 随机浏览器令牌的摘要，不保存原令牌。 */
  tokenHash: string
  /** 已验证的登录用户名。 */
  username: string
  /** 创建时间。 */
  createdAt: number
  /** 到期时间。 */
  expiresAt: number
  /** 账号凭据摘要，改密后旧会话失效。 */
  credentialHash: string
  /** 所选远程服务器地址。 */
  remoteUrl?: string
  /** 使用浏览器令牌加密的远程令牌。 */
  remoteToken?: string
}
