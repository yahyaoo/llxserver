import type { PlaylistServiceRuntime } from '../service/PlaylistService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/PlaylistService'
/** 用户歌单、历史快照、缓存列表和平台歌单查询的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 查询指定用户的歌单与歌曲数据；委托业务服务执行。
 * @param context /api/data 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getData = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getData(context, runtime)

/**
 * 查询用户歌单历史快照列表；委托业务服务执行。
 * @param context /api/data/snapshots 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getDataSnapshots = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getDataSnapshots(context, runtime)

/**
 * 读取指定用户与快照标识对应的歌单数据；委托业务服务执行。
 * @param context /api/data/snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getDataSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getDataSnapshot(context, runtime)

/**
 * 使用选定快照恢复用户歌单数据；委托业务服务执行。
 * @param context /api/data/restore-snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataRestoreSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataRestoreSnapshot(context, runtime)

/**
 * 删除用户的指定歌单；委托业务服务执行。
 * @param context /api/music/user/list/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicUserListRemove = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postMusicUserListRemove(context, runtime)

/**
 * 调整用户歌单排列顺序；委托业务服务执行。
 * @param context /api/music/user/list/reorder 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicUserListReorder = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postMusicUserListReorder(context, runtime)

/**
 * 向用户歌单添加歌曲；委托业务服务执行。
 * @param context /api/music/user/list/add 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicUserListAdd = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postMusicUserListAdd(context, runtime)

/**
 * 删除用户指定的历史快照；委托业务服务执行。
 * @param context /api/data/delete-snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataDeleteSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataDeleteSnapshot(context, runtime)

/**
 * 上传歌单快照并保存到用户空间；委托业务服务执行。
 * @param context /api/data/upload-snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataUploadSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataUploadSnapshot(context, runtime)

/**
 * 查询用户列表设置；委托业务服务执行。
 * @param context /api/user/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getUserList(context, runtime)

/**
 * 保存用户列表设置；委托业务服务执行。
 * @param context /api/user/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postUserList(context, runtime)

/**
 * 查询用户服务器缓存歌曲列表；委托业务服务执行。
 * @param context /api/music/cache/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCacheList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicCacheList(context, runtime)

/** 查询缓存库分页只读视图。 */
export const getMusicCachePage = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicCachePage(context, runtime)

/**
 * 查询用户自定义音乐目录歌曲列表；委托业务服务执行。
 * @param context /api/music/custom/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCustomList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicCustomList(context, runtime)

/** 查询自定义音乐目录分页只读视图。 */
export const getMusicCustomPage = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicCustomPage(context, runtime)

/** 查询歌单元信息。 */
export const getUserListMeta = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getUserListMeta(context, runtime)

/** 查询歌单分页歌曲。 */
export const getUserListSongs = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getUserListSongs(context, runtime)

/**
 * 删除指定歌单并更新用户数据；委托业务服务执行。
 * @param context /api/data/delete-playlist 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataDeletePlaylist = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataDeletePlaylist(context, runtime)

/**
 * 删除指定歌单中的歌曲；委托业务服务执行。
 * @param context /api/data/delete-song 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataDeleteSong = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataDeleteSong(context, runtime)

/**
 * 重命名指定歌单；委托业务服务执行。
 * @param context /api/data/rename-playlist 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataRenamePlaylist = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataRenamePlaylist(context, runtime)

/**
 * 批量删除指定歌单中的歌曲；委托业务服务执行。
 * @param context /api/data/batch-delete-songs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postDataBatchDeleteSongs = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataBatchDeleteSongs(context, runtime)

/**
 * 分页查询平台推荐歌单；委托业务服务执行。
 * @param context /api/music/songList/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicSongListList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicSongListList(context, runtime)

/**
 * 查询指定平台排行榜歌曲；委托业务服务执行。
 * @param context /api/music/leaderboard/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicLeaderboardList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicLeaderboardList(context, runtime)
