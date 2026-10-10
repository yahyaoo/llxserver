/** 令牌管理接口公开字段，不输出数据库摘要与加密内容。 */
export interface ApiTokenVo { name: string, token: string, createdAt: number, expiresAt: number | null, lastUsed?: number, disabled?: boolean }
