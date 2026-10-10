import * as client from './CustomSourceClient'

/** 自定义音源接口：脚本执行、元信息解析和源选择统一由集成层承担。 @author yahyaoo */
export interface CustomSourceGateway {
  /** 脚本元信息。 */
  extractMetadata: typeof client.extractMetadata
  /** 初始化脚本。 */
  loadUserApi: typeof client.loadUserApi
  /** 重新装载用户音源。 */
  initUserApis: typeof client.initUserApis
  /** 当前装载状态。 */
  getApiStatus: typeof client.getApiStatus
  /** 按平台、歌曲和音质调用已加载音源，候选脚本失败时继续尝试。 */
  callUserApiGetMusicUrl: typeof client.callUserApiGetMusicUrl
  /** 平台支持判断。 */
  isSourceSupported: typeof client.isSourceSupported
  /** 已装载音源集合。 */
  getLoadedApis: typeof client.getLoadedApis
  /** 已装载数量。 */
  getLoadedApisCount: typeof client.getLoadedApisCount
}
/** 将脚本客户端的装载、状态和解析能力公开给业务服务。 @author yahyaoo */
export const customSourceGateway: CustomSourceGateway = client
export const { extractMetadata, loadUserApi, initUserApis, getApiStatus, callUserApiGetMusicUrl, isSourceSupported, getLoadedApis, getLoadedApisCount } = customSourceGateway
export type { ApiStatusInfo } from './CustomSourceClient'
