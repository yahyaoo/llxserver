import type { LibraryServiceRuntime } from '../service/LibraryService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/LibraryService'
/** 用户收藏及屏蔽的歌手和专辑的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 读取用户收藏歌手列表；委托业务服务执行。
 * @param context /api/user/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserLibraryArtists(context, runtime)

/**
 * 保存用户收藏歌手列表；委托业务服务执行。
 * @param context /api/user/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserLibraryArtists(context, runtime)

/**
 * 读取用户收藏专辑列表；委托业务服务执行。
 * @param context /api/user/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserLibraryAlbums(context, runtime)

/**
 * 保存用户收藏专辑列表；委托业务服务执行。
 * @param context /api/user/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserLibraryAlbums(context, runtime)

/**
 * 读取用户屏蔽歌手列表；委托业务服务执行。
 * @param context /api/user/dislike/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserDislikeLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserDislikeLibraryArtists(context, runtime)

/**
 * 保存用户屏蔽歌手列表；委托业务服务执行。
 * @param context /api/user/dislike/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserDislikeLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserDislikeLibraryArtists(context, runtime)

/**
 * 读取用户屏蔽专辑列表；委托业务服务执行。
 * @param context /api/user/dislike/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserDislikeLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserDislikeLibraryAlbums(context, runtime)

/**
 * 保存用户屏蔽专辑列表；委托业务服务执行。
 * @param context /api/user/dislike/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserDislikeLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserDislikeLibraryAlbums(context, runtime)
