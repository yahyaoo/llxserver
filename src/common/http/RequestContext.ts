/** HTTP 请求上下文，业务域只通过此契约获得已装配的基础能力。 @author yahyaoo */
import type { IncomingMessage, ServerResponse } from 'node:http'
/**
 * RequestContext 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface RequestContext {
  /** 原请求。 */
  req: IncomingMessage
  /** 原响应。 */
  res: ServerResponse
  /** 原请求路径。 */
  pathname: string
  /** 原请求 URL。 */
  urlObj: URL
  /** 原客户端地址。 */
  ip: string | undefined
  /** 收藏归属解析，沿用原权限判断。 */
  getLibUsername?: (req: IncomingMessage) => string | null
}
/** 应用入口装配的能力类型，禁止业务域直接导入对方实现。 @author yahyaoo */
export type ServerRuntime = ReturnType<typeof import('../../server/server').createServerRuntime>
