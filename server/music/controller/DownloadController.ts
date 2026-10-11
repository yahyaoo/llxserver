import type { DownloadServiceRuntime } from '../service/DownloadService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/DownloadService'
/** 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 查询用户歌单自动下载状态；委托业务服务执行。
 * @param context /api/user/sync-download/status 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserSyncDownloadStatus = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getUserSyncDownloadStatus(context, runtime)

/**
 * 立即执行用户歌单自动下载任务；委托业务服务执行。
 * @param context /api/user/sync-download/trigger 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserSyncDownloadTrigger = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUserSyncDownloadTrigger(context, runtime)

/**
 * 取消用户当前自动下载任务；委托业务服务执行。
 * @param context /api/user/sync-download/cancel 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserSyncDownloadCancel = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUserSyncDownloadCancel(context, runtime)

/**
 * 查询自动下载任务进度与处理日志；委托业务服务执行。
 * @param context /api/user/sync-download/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserSyncDownloadProgress = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getUserSyncDownloadProgress(context, runtime)

/**
 * 将同步下载歌曲迁移到指定存储位置；委托业务服务执行。
 * @param context /api/user/sync-download/migrate-storage 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserSyncDownloadMigrateStorage = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUserSyncDownloadMigrateStorage(context, runtime)

/**
 * 查询后台调度任务状态；委托业务服务执行。
 * @param context /api/tasks/status 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getTasksStatus = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getTasksStatus(context, runtime)

/**
 * 手动执行指定调度任务；委托业务服务执行。
 * @param context /api/tasks/trigger 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postTasksTrigger = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postTasksTrigger(context, runtime)

/**
 * 查询用户定时任务相关配置和数据；委托业务服务执行。
 * @param context /api/tasks/user-data 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getTasksUserData = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getTasksUserData(context, runtime)

/**
 * 创建、查询或取消本地歌曲洗版任务；委托业务服务执行。
 * @param context /api/music/remaster/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleMusicRemaster = (context: RequestContext, runtime: DownloadServiceRuntime) => service.handleMusicRemaster(context, runtime)

/**
 * 保存用户服务器缓存配置；委托业务服务执行。
 * @param context /api/music/cache/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheConfig = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheConfig(context, runtime)

/**
 * 列出当前用户可用的缓存目录；委托业务服务执行。
 * @param context /api/music/cache/directories 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheDirectories = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheDirectories(context, runtime)

/**
 * 扫描缓存目录并同步歌曲索引；委托业务服务执行。
 * @param context /api/music/cache/sync 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheSync = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSync(context, runtime)

/**
 * 查询缓存目录下的歌曲分类子目录；委托业务服务执行。
 * @param context /api/music/cache/subdirs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheSubdirs = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheSubdirs(context, runtime)

/**
 * 创建缓存子目录；委托业务服务执行。
 * @param context /api/music/cache/mkdir 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheMkdir = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheMkdir(context, runtime)

/**
 * 将缓存歌曲归入指定分类目录；委托业务服务执行。
 * @param context /api/music/cache/categorize 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheCategorize = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheCategorize(context, runtime)

/**
 * 重命名缓存分类子目录；委托业务服务执行。
 * @param context /api/music/cache/subdirs/rename 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheSubdirsRename = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSubdirsRename(context, runtime)

/**
 * 检查目录是否存在及可访问；委托业务服务执行。
 * @param context /api/utils/check-dir 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUtilsCheckDir = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUtilsCheckDir(context, runtime)

/**
 * 删除缓存分类子目录及相关索引；委托业务服务执行。
 * @param context /api/music/cache/subdirs/delete 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheSubdirsDelete = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSubdirsDelete(context, runtime)

/**
 * 重命名缓存歌曲文件；委托业务服务执行。
 * @param context /api/music/cache/rename 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheRename = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheRename(context, runtime)

/**
 * 检查歌曲是否已下载到服务器；委托业务服务执行。
 * @param context /api/music/server-download/check 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicServerDownloadCheck = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicServerDownloadCheck(context, runtime)

/**
 * 返回服务器已下载音频文件，支持范围请求；委托业务服务执行。
 * @param context /api/music/server-download/file/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleMusicServerDownloadFile = (context: RequestContext, runtime: DownloadServiceRuntime) => service.handleMusicServerDownloadFile(context, runtime)

/**
 * 检查歌曲是否已存在于缓存；委托业务服务执行。
 * @param context /api/music/cache/check 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheCheck = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheCheck(context, runtime)

/**
 * 查询用户缓存下载队列；委托业务服务执行。
 * @param context /api/music/cache/queue 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheQueue = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheQueue(context, runtime)

/**
 * 将歌曲加入服务器缓存下载队列；委托业务服务执行。
 * @param context /api/music/cache/queue 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheQueue = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueue(context, runtime)

/**
 * 修改缓存下载队列并发数；委托业务服务执行。
 * @param context /api/music/cache/queue/concurrency 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheQueueConcurrency = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueueConcurrency(context, runtime)

/**
 * 恢复缓存下载队列执行；委托业务服务执行。
 * @param context /api/music/cache/queue/resume 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheQueueResume = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueueResume(context, runtime)

/**
 * 移除指定缓存下载排队任务；委托业务服务执行。
 * @param context /api/music/cache/queue/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheQueueRemove = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueueRemove(context, runtime)

/**
 * 下载歌曲并写入服务器缓存；委托业务服务执行。
 * @param context /api/music/cache/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheDownload = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheDownload(context, runtime)

/**
 * 停止指定缓存下载任务；委托业务服务执行。
 * @param context /api/music/cache/stop 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheStop = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheStop(context, runtime)

/**
 * 返回服务器缓存音频，支持范围请求；委托业务服务执行。
 * @param context /api/music/cache/file/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleMusicCacheFile = (context: RequestContext, runtime: DownloadServiceRuntime) => service.handleMusicCacheFile(context, runtime)

/**
 * 统计缓存歌曲数量与占用空间；委托业务服务执行。
 * @param context /api/music/cache/stats 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheStats = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheStats(context, runtime)

/**
 * 清理用户缓存歌曲及索引；委托业务服务执行。
 * @param context /api/music/cache/clear 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheClear = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheClear(context, runtime)

/**
 * 清理用户缓存歌词；委托业务服务执行。
 * @param context /api/music/cache/lyric/clear 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheLyricClear = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheLyricClear(context, runtime)

/**
 * 查询缓存下载处理进度；委托业务服务执行。
 * @param context /api/music/cache/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheProgress = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheProgress(context, runtime)

/**
 * 返回缓存歌曲封面；委托业务服务执行。
 * @param context /api/music/cache/cover 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheCover = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheCover(context, runtime)

/**
 * 删除指定缓存歌曲文件及索引；委托业务服务执行。
 * @param context /api/music/cache/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheRemove = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheRemove(context, runtime)

/**
 * 在缓存子目录之间移动歌曲；委托业务服务执行。
 * @param context /api/music/cache/move 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheMove = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheMove(context, runtime)

/**
 * 迁移用户缓存到指定基础存储位置；委托业务服务执行。
 * @param context /api/music/cache/switch-base 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheSwitchBase = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSwitchBase(context, runtime)

/**
 * 更新缓存歌曲的文件元信息；委托业务服务执行。
 * @param context /api/music/cache/updateMetadata 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheUpdateMetadata = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheUpdateMetadata(context, runtime)

/**
 * 读取缓存歌曲内嵌歌词；委托业务服务执行。
 * @param context /api/music/cache/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheEmbedLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheEmbedLyric(context, runtime)

/**
 * 向缓存歌曲文件写入内嵌歌词；委托业务服务执行。
 * @param context /api/music/cache/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheEmbedLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheEmbedLyric(context, runtime)

/**
 * 为缓存歌曲关联平台元信息；委托业务服务执行。
 * @param context /api/music/cache/link 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheLink = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheLink(context, runtime)

/**
 * 读取用户歌曲的缓存歌词；委托业务服务执行。
 * @param context /api/music/cache/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheLyric(context, runtime)

/**
 * 保存用户歌曲的缓存歌词；委托业务服务执行。
 * @param context /api/music/cache/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCacheLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheLyric(context, runtime)

/**
 * 代理下载远端音频，可按请求写入标签并返回文件；委托业务服务执行。
 * @param context /api/music/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicDownload = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicDownload(context, runtime)
