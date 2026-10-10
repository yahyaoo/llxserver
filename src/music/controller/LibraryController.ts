import type { LibraryServiceRuntime } from '../service/LibraryService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/LibraryService'
/** Library 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/user/library/artists 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserLibraryArtists(context, runtime)

/** @param context /api/user/library/artists 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserLibraryArtists(context, runtime)

/** @param context /api/user/library/albums 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserLibraryAlbums(context, runtime)

/** @param context /api/user/library/albums 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserLibraryAlbums(context, runtime)

/** @param context /api/user/dislike/library/artists 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserDislikeLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserDislikeLibraryArtists(context, runtime)

/** @param context /api/user/dislike/library/artists 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserDislikeLibraryArtists = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserDislikeLibraryArtists(context, runtime)

/** @param context /api/user/dislike/library/albums 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserDislikeLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.getUserDislikeLibraryAlbums(context, runtime)

/** @param context /api/user/dislike/library/albums 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserDislikeLibraryAlbums = (context: RequestContext, runtime: LibraryServiceRuntime) => service.postUserDislikeLibraryAlbums(context, runtime)
