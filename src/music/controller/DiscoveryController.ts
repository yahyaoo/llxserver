import type { DiscoveryServiceRuntime } from '../service/DiscoveryService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/DiscoveryService'
/** Discovery 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/music/custom/sync 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCustomSync = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomSync(context, runtime)

/** @param context /api/music/custom/file 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleMusicCustomFile = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.handleMusicCustomFile(context, runtime)

/** @param context /api/music/custom/cover 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCustomCover = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicCustomCover(context, runtime)

/** @param context /api/music/custom/remove 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCustomRemove = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomRemove(context, runtime)

/** @param context /api/music/custom/link 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCustomLink = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomLink(context, runtime)

/** @param context /api/music/custom/updateMetadata 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCustomUpdateMetadata = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomUpdateMetadata(context, runtime)

/** @param context /api/music/custom/embedLyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicCustomEmbedLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicCustomEmbedLyric(context, runtime)

/** @param context /api/music/custom/embedLyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicCustomEmbedLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomEmbedLyric(context, runtime)

/** @param context /api/music/identify 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicIdentify = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicIdentify(context, runtime)

/** @param context /api/music/lyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicLyric(context, runtime)

/** @param context /api/music/search 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSearch(context, runtime)

/** @param context /api/music/tipSearch 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicTipSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicTipSearch(context, runtime)

/** @param context /api/music/artistDetail 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicArtistDetail = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicArtistDetail(context, runtime)

/** @param context /api/music/artistAlbums 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicArtistAlbums = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicArtistAlbums(context, runtime)

/** @param context /api/music/artistSongs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicArtistSongs = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicArtistSongs(context, runtime)

/** @param context /api/music/albumSongs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicAlbumSongs = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicAlbumSongs(context, runtime)

/** @param context /api/music/progress 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicProgress = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicProgress(context, runtime)

/** @param context /api/music/url 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicUrl = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicUrl(context, runtime)

/** @param context /api/music/quality/size 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicQualitySize = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicQualitySize(context, runtime)

/** @param context /api/music/lyric 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicLyric(context, runtime)

/** @param context /api/music/hotSearch 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicHotSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicHotSearch(context, runtime)

/** @param context /api/music/songList/tags 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicSongListTags = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListTags(context, runtime)

/** @param context /api/music/songList/detail 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicSongListDetail = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListDetail(context, runtime)

/** @param context /api/music/songList/search 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicSongListSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListSearch(context, runtime)

/** @param context /api/music/songList/userPlaylist 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicSongListUserPlaylist = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListUserPlaylist(context, runtime)

/** @param context /api/music/leaderboard/boards 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicLeaderboardBoards = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicLeaderboardBoards(context, runtime)

/** @param context /api/music/comment 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicComment = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicComment(context, runtime)

/** @param context /api/music/dislike 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicDislike = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicDislike(context, runtime)

/** @param context /api/music/dislike/add 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicDislikeAdd = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicDislikeAdd(context, runtime)
