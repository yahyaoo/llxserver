/** 原用户令牌契约，仅描述既有字段，不增加返回字段。 @author yahyaoo */
export interface UserToken {
  /** 令牌原值。 */
  token: string
  /** 用户设置的令牌名称。 */
  name: string
  /** 创建时间，毫秒。 */
  createdAt: number
  /** 到期时间；空值表示不限制。 */
  expiresAt: number | null
  /** 最近使用时间。 */
  lastUsed?: number
  /** 禁用标记。 */
  disabled?: boolean
}
