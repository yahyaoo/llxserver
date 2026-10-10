import type { PlaylistServiceRuntime } from '../service/PlaylistService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/PlaylistService'
/** Playlist 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/data 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getData = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getData(context, runtime)

/** @param context /api/data/snapshots 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getDataSnapshots = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getDataSnapshots(context, runtime)

/** @param context /api/data/snapshot 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getDataSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getDataSnapshot(context, runtime)

/** @param context /api/data/restore-snapshot 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataRestoreSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataRestoreSnapshot(context, runtime)

/** @param context /api/music/user/list/remove 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicUserListRemove = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postMusicUserListRemove(context, runtime)

/** @param context /api/music/user/list/reorder 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicUserListReorder = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postMusicUserListReorder(context, runtime)

/** @param context /api/music/user/list/add 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicUserListAdd = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postMusicUserListAdd(context, runtime)

/** @param context /api/data/delete-snapshot 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataDeleteSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataDeleteSnapshot(context, runtime)

/** @param context /api/data/upload-snapshot 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataUploadSnapshot = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataUploadSnapshot(context, runtime)

/** @param context /api/user/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getUserList(context, runtime)

/** @param context /api/user/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postUserList(context, runtime)

/** @param context /api/music/cache/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCacheList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicCacheList(context, runtime)

/** @param context /api/music/custom/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCustomList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicCustomList(context, runtime)

/** @param context /api/data/delete-playlist 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataDeletePlaylist = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataDeletePlaylist(context, runtime)

/** @param context /api/data/delete-song 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataDeleteSong = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataDeleteSong(context, runtime)

/** @param context /api/data/rename-playlist 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataRenamePlaylist = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataRenamePlaylist(context, runtime)

/** @param context /api/data/batch-delete-songs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postDataBatchDeleteSongs = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.postDataBatchDeleteSongs(context, runtime)

/** @param context /api/music/songList/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicSongListList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicSongListList(context, runtime)

/** @param context /api/music/leaderboard/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicLeaderboardList = (context: RequestContext, runtime: PlaylistServiceRuntime) => service.getMusicLeaderboardList(context, runtime)
