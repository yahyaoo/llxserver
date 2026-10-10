import sdk from './internal/musicSdk/index.js'

/**
 * 音乐平台接口契约。平台实现由集成层维护，业务模块仅使用此公开入口。
 * 兼容平台原有动态能力，参数、返回值及取消请求对象均透传。
 * @author yahyaoo
 */
export interface MusicGateway {
  /** 初始化平台请求能力和运行缓存。 */
  init: typeof sdk.init
  /** 多平台搜索能力。 */
  searchMusic: typeof sdk.searchMusic
  /** 根据歌曲元信息匹配可用平台歌曲。 */
  findMusic: typeof sdk.findMusic
  /** 可用平台目录。 */
  sources: typeof sdk.sources
  /** 按平台键访问搜索、歌词、歌曲详情及歌单等动态接口。 */
  [platform: string]: any
}

/** 默认网关保留 SDK 对象身份，避免重复初始化或复制平台缓存。 @author yahyaoo */
const musicGateway: MusicGateway = sdk
export default musicGateway
export { default as txMusicInfo } from './internal/musicSdk/tx/musicInfo.js'
export { default as wyMusicInfo } from './internal/musicSdk/wy/musicInfo.js'
export { getMusicInfo as kgGetMusicInfo } from './internal/musicSdk/kg/musicInfo.js'
export { getMusicInfo as mgGetMusicInfo } from './internal/musicSdk/mg/musicInfo.js'
export { default as bdMusicInfo } from './internal/musicSdk/bd/musicInfo.js'
