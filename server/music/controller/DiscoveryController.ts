import type { DiscoveryServiceRuntime } from '../service/DiscoveryService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/DiscoveryService'
/** 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 扫描用户自定义歌曲目录并刷新索引；委托业务服务执行。
 * @param context /api/music/custom/sync 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCustomSync = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomSync(context, runtime)

/**
 * 校验用户与文件路径后返回自定义音频，支持范围请求；委托业务服务执行。
 * @param context /api/music/custom/file 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleMusicCustomFile = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.handleMusicCustomFile(context, runtime)

/**
 * 返回自定义歌曲的封面图片；委托业务服务执行。
 * @param context /api/music/custom/cover 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCustomCover = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicCustomCover(context, runtime)

/**
 * 删除用户授权范围内的自定义歌曲文件；委托业务服务执行。
 * @param context /api/music/custom/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCustomRemove = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomRemove(context, runtime)

/**
 * 为自定义歌曲关联音乐平台歌曲信息；委托业务服务执行。
 * @param context /api/music/custom/link 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCustomLink = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomLink(context, runtime)

/**
 * 更新自定义歌曲文件的元信息标签；委托业务服务执行。
 * @param context /api/music/custom/updateMetadata 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCustomUpdateMetadata = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomUpdateMetadata(context, runtime)

/**
 * 读取自定义歌曲内嵌歌词；委托业务服务执行。
 * @param context /api/music/custom/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicCustomEmbedLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicCustomEmbedLyric(context, runtime)

/**
 * 将歌词写入自定义歌曲文件；委托业务服务执行。
 * @param context /api/music/custom/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicCustomEmbedLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicCustomEmbedLyric(context, runtime)

/**
 * 提取音频指纹并查询匹配的歌曲录音；委托业务服务执行。
 * @param context /api/music/identify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicIdentify = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicIdentify(context, runtime)

/**
 * 查询歌曲歌词；委托业务服务执行。
 * @param context /api/music/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicLyric(context, runtime)

/**
 * 按关键词、平台和分页参数搜索歌曲；委托业务服务执行。
 * @param context /api/music/search 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSearch(context, runtime)

/**
 * 查询音乐平台的搜索建议；委托业务服务执行。
 * @param context /api/music/tipSearch 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicTipSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicTipSearch(context, runtime)

/**
 * 聚合歌手简介、头像及详情；委托业务服务执行。
 * @param context /api/music/artistDetail 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicArtistDetail = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicArtistDetail(context, runtime)

/**
 * 分页查询歌手专辑；委托业务服务执行。
 * @param context /api/music/artistAlbums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicArtistAlbums = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicArtistAlbums(context, runtime)

/**
 * 分页查询歌手歌曲；委托业务服务执行。
 * @param context /api/music/artistSongs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicArtistSongs = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicArtistSongs(context, runtime)

/**
 * 查询专辑歌曲；委托业务服务执行。
 * @param context /api/music/albumSongs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicAlbumSongs = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicAlbumSongs(context, runtime)

/**
 * 查询歌曲处理任务进度；委托业务服务执行。
 * @param context /api/music/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicProgress = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicProgress(context, runtime)

/**
 * 按歌曲及音质解析可播放音频地址；委托业务服务执行。
 * @param context /api/music/url 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicUrl = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicUrl(context, runtime)

/**
 * 查询歌曲各音质的文件大小；委托业务服务执行。
 * @param context /api/music/quality/size 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicQualitySize = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicQualitySize(context, runtime)

/**
 * 按提交的歌曲信息解析歌词；委托业务服务执行。
 * @param context /api/music/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicLyric = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicLyric(context, runtime)

/**
 * 查询音乐平台热门搜索关键词；委托业务服务执行。
 * @param context /api/music/hotSearch 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicHotSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicHotSearch(context, runtime)

/**
 * 查询平台歌单标签分类；委托业务服务执行。
 * @param context /api/music/songList/tags 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicSongListTags = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListTags(context, runtime)

/**
 * 查询平台歌单详情与歌曲；委托业务服务执行。
 * @param context /api/music/songList/detail 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicSongListDetail = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListDetail(context, runtime)

/**
 * 按关键词搜索平台歌单；委托业务服务执行。
 * @param context /api/music/songList/search 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicSongListSearch = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListSearch(context, runtime)

/**
 * 查询平台用户公开歌单；委托业务服务执行。
 * @param context /api/music/songList/userPlaylist 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicSongListUserPlaylist = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicSongListUserPlaylist(context, runtime)

/**
 * 查询平台排行榜分类；委托业务服务执行。
 * @param context /api/music/leaderboard/boards 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicLeaderboardBoards = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicLeaderboardBoards(context, runtime)

/**
 * 查询歌曲评论及分页结果；委托业务服务执行。
 * @param context /api/music/comment 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicComment = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicComment(context, runtime)

/**
 * 查询用户不喜欢规则；委托业务服务执行。
 * @param context /api/music/dislike 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicDislike = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.getMusicDislike(context, runtime)

/**
 * 向用户不喜欢规则中添加歌曲或匹配条目；委托业务服务执行。
 * @param context /api/music/dislike/add 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicDislikeAdd = (context: RequestContext, runtime: DiscoveryServiceRuntime) => service.postMusicDislikeAdd(context, runtime)
