import { httpFetch } from './internal/request.js'
import { getProxyAgent } from './internal/proxy.js'

/** 平台网络接口，保留原代理解析和可取消请求协议。 @author yahyaoo */
export interface NetworkGateway {
  /** 平台原网络请求。 */
  httpFetch: typeof httpFetch
  /** 原代理代理对象工厂。 */
  getProxyAgent: typeof getProxyAgent
}
/** 默认网络实现，业务代码无需知道 SDK 内部布局。 @author yahyaoo */
export const networkGateway: NetworkGateway = { httpFetch, getProxyAgent }
export { httpFetch, getProxyAgent }
