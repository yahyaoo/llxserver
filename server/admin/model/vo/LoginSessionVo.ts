/** 会话公开信息，不向客户端输出数据库摘要和远程令牌。 */
export interface LoginSessionVo {
  username: string
  expiresAt: number
  rememberMe: boolean
}
