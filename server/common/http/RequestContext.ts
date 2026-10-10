/** HTTP 请求上下文，业务域只通过此契约获得已装配的基础能力。 @author yahyaoo */
import type { IncomingMessage, ServerResponse } from 'node:http'
/** HTTP 请求上下文，包含路径、响应对象、客户端地址及收藏归属解析器。 @author yahyaoo */
export interface RequestContext {
  /** Node HTTP 请求，提供请求方法、认证头和上传正文。 */
  req: IncomingMessage
  /** HTTP 响应，用于写入状态码、响应头和处理结果。 */
  res: ServerResponse
  /** URL 的 pathname，用于路由匹配和文件请求定位。 */
  pathname: string
  /** 已解析的请求 URL，提供查询参数与路径。 */
  urlObj: URL
  /** 解析代理请求头后的客户端地址，用于访问日志。 */
  ip: string | undefined
  /** 根据请求身份解析可访问的收藏用户空间；拒绝访问时返回 null。 */
  getLibUsername?: (req: IncomingMessage) => string | null
}
/** 应用入口装配的能力类型，禁止业务域直接导入对方实现。 @author yahyaoo */
export type ServerRuntime = ReturnType<typeof import('../../server/server').createServerRuntime>
