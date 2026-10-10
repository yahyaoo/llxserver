import type { DownloadServiceRuntime } from '../service/DownloadService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/DownloadService'
/** Download 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/user/sync-download/status 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserSyncDownloadStatus = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getUserSyncDownloadStatus(context, runtime)

/** @param context /api/user/sync-download/trigger 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserSyncDownloadTrigger = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUserSyncDownloadTrigger(context, runtime)

/** @param context /api/user/sync-download/cancel 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserSyncDownloadCancel = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUserSyncDownloadCancel(context, runtime)

/** @param context /api/user/sync-download/progress 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserSyncDownloadProgress = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getUserSyncDownloadProgress(context, runtime)

/** @param context /api/user/sync-download/migrate-storage 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserSyncDownloadMigrateStorage = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUserSyncDownloadMigrateStorage(context, runtime)

/** @param context /api/tasks/status 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getTasksStatus = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getTasksStatus(context, runtime)

/** @param context /api/tasks/trigger 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postTasksTrigger = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postTasksTrigger(context, runtime)

/** @param context /api/tasks/user-data 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getTasksUserData = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getTasksUserData(context, runtime)

/** @param context /api/music/remaster/ 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleMusicRemaster = (context: RequestContext, runtime: DownloadServiceRuntime) => service.handleMusicRemaster(context, runtime)

/** @param context /api/music/cache/config 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheConfig = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheConfig(context, runtime)

/** @param context /api/music/cache/directories 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheDirectories = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheDirectories(context, runtime)

/** @param context /api/music/cache/sync 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheSync = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSync(context, runtime)

/** @param context /api/music/cache/subdirs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheSubdirs = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheSubdirs(context, runtime)

/** @param context /api/music/cache/mkdir 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheMkdir = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheMkdir(context, runtime)

/** @param context /api/music/cache/categorize 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheCategorize = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheCategorize(context, runtime)

/** @param context /api/music/cache/subdirs/rename 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheSubdirsRename = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSubdirsRename(context, runtime)

/** @param context /api/utils/check-dir 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUtilsCheckDir = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postUtilsCheckDir(context, runtime)

/** @param context /api/music/cache/subdirs/delete 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheSubdirsDelete = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSubdirsDelete(context, runtime)

/** @param context /api/music/cache/rename 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheRename = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheRename(context, runtime)

/** @param context /api/music/server-download/check 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicServerDownloadCheck = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicServerDownloadCheck(context, runtime)

/** @param context /api/music/server-download/file/ 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleMusicServerDownloadFile = (context: RequestContext, runtime: DownloadServiceRuntime) => service.handleMusicServerDownloadFile(context, runtime)

/** @param context /api/music/cache/check 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheCheck = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheCheck(context, runtime)

/** @param context /api/music/cache/queue 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheQueue = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheQueue(context, runtime)

/** @param context /api/music/cache/queue 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheQueue = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueue(context, runtime)

/** @param context /api/music/cache/queue/concurrency 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheQueueConcurrency = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueueConcurrency(context, runtime)

/** @param context /api/music/cache/queue/resume 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheQueueResume = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueueResume(context, runtime)

/** @param context /api/music/cache/queue/remove 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheQueueRemove = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheQueueRemove(context, runtime)

/** @param context /api/music/cache/download 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheDownload = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheDownload(context, runtime)

/** @param context /api/music/cache/stop 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheStop = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheStop(context, runtime)

/** @param context /api/music/cache/file/ 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleMusicCacheFile = (context: RequestContext, runtime: DownloadServiceRuntime) => service.handleMusicCacheFile(context, runtime)

/** @param context /api/music/cache/stats 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheStats = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheStats(context, runtime)

/** @param context /api/music/cache/clear 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheClear = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheClear(context, runtime)

/** @param context /api/music/cache/lyric/clear 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheLyricClear = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheLyricClear(context, runtime)

/** @param context /api/music/cache/progress 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheProgress = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheProgress(context, runtime)

/** @param context /api/music/cache/cover 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheCover = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheCover(context, runtime)

/** @param context /api/music/cache/remove 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheRemove = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheRemove(context, runtime)

/** @param context /api/music/cache/move 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheMove = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheMove(context, runtime)

/** @param context /api/music/cache/switch-base 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheSwitchBase = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheSwitchBase(context, runtime)

/** @param context /api/music/cache/updateMetadata 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheUpdateMetadata = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheUpdateMetadata(context, runtime)

/** @param context /api/music/cache/embedLyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheEmbedLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheEmbedLyric(context, runtime)

/** @param context /api/music/cache/embedLyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheEmbedLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheEmbedLyric(context, runtime)

/** @param context /api/music/cache/link 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheLink = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheLink(context, runtime)

/** @param context /api/music/cache/lyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicCacheLyric(context, runtime)

/** @param context /api/music/cache/lyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCacheLyric = (context: RequestContext, runtime: DownloadServiceRuntime) => service.postMusicCacheLyric(context, runtime)

/** @param context /api/music/download 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicDownload = (context: RequestContext, runtime: DownloadServiceRuntime) => service.getMusicDownload(context, runtime)
