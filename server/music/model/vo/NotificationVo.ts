/** 查询到的账号未读消息。 */
export interface NotificationVo {
  /** 与通知推送标识一致的消息编号。 */
  id: string
  /** 消息级别。 */
  level: string
  /** 消息标题。 */
  title: string
  /** 消息正文。 */
  message?: string
  /** 站内跳转地址。 */
  link?: string
  /** 消息创建时间，单位毫秒。 */
  createdAt: number
}
