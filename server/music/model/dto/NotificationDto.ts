/** 新增或更新账号未读消息的仓储写入参数。 */
export interface NotificationDto {
  /** 接收消息的账号。 */
  username: string
  /** 与通知推送标识一致的消息编号。 */
  noticeId: string
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
