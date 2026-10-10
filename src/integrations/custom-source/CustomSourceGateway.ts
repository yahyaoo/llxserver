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
  /** 按原策略获取播放地址。 */
  callUserApiGetMusicUrl: typeof client.callUserApiGetMusicUrl
  /** 平台支持判断。 */
  isSourceSupported: typeof client.isSourceSupported
  /** 已装载音源集合。 */
  getLoadedApis: typeof client.getLoadedApis
  /** 已装载数量。 */
  getLoadedApisCount: typeof client.getLoadedApisCount
}
/** 默认脚本网关，原实现和异常策略保持一致。 @author yahyaoo */
export const customSourceGateway: CustomSourceGateway = client
export const { extractMetadata, loadUserApi, initUserApis, getApiStatus, callUserApiGetMusicUrl, isSourceSupported, getLoadedApis, getLoadedApisCount } = customSourceGateway
export type { ApiStatusInfo } from './CustomSourceClient'
