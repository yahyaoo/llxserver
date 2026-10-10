import type { AuthenticationServiceRuntime } from '../service/AuthenticationService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/AuthenticationService'
/** Authentication 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/user/verify 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserVerify = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserVerify(context, runtime)

/** @param context /api/user/login 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserLogin = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserLogin(context, runtime)

/** @param context /api/user/logout 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserLogout = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserLogout(context, runtime)

/** @param context /api/user/auth/verify 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserAuthVerify = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getUserAuthVerify(context, runtime)

/** @param context /api/user/token/config 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleUserTokenConfig = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.handleUserTokenConfig(context, runtime)

/** @param context /api/user/token/add 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserTokenAdd = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenAdd(context, runtime)

/** @param context /api/user/token/remove 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserTokenRemove = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenRemove(context, runtime)

/** @param context /api/user/token/update 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserTokenUpdate = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenUpdate(context, runtime)

/** @param context /api/user/token/toggle 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserTokenToggle = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenToggle(context, runtime)

/** @param context /api/user/token/logs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserTokenLogs = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getUserTokenLogs(context, runtime)

/** @param context /api/music/config 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicConfig = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getMusicConfig(context, runtime)

/** @param context /api/music/auth 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicAuth = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postMusicAuth(context, runtime)

/** @param context /api/music/auth/logout 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postMusicAuthLogout = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postMusicAuthLogout(context, runtime)

/** @param context /api/music/auth/verify 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getMusicAuthVerify = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getMusicAuthVerify(context, runtime)
