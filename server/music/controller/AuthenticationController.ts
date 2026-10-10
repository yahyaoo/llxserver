import type { AuthenticationServiceRuntime } from '../service/AuthenticationService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/AuthenticationService'
/** 用户会话、播放器访问密码和持久访问令牌的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 验证用户名与连接密码，记录认证结果；委托业务服务执行。
 * @param context /api/user/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserVerify = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserVerify(context, runtime)

/**
 * 校验用户凭据并创建登录会话；委托业务服务执行。
 * @param context /api/user/login 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserLogin = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserLogin(context, runtime)

/**
 * 注销用户会话并清除会话 Cookie；委托业务服务执行。
 * @param context /api/user/logout 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserLogout = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserLogout(context, runtime)

/**
 * 检查用户会话并返回当前认证状态；委托业务服务执行。
 * @param context /api/user/auth/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserAuthVerify = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getUserAuthVerify(context, runtime)

/**
 * 查询或保存用户持久令牌功能配置；委托业务服务执行。
 * @param context /api/user/token/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleUserTokenConfig = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.handleUserTokenConfig(context, runtime)

/**
 * 为当前用户创建访问令牌；委托业务服务执行。
 * @param context /api/user/token/add 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserTokenAdd = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenAdd(context, runtime)

/**
 * 删除当前用户的指定访问令牌；委托业务服务执行。
 * @param context /api/user/token/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserTokenRemove = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenRemove(context, runtime)

/**
 * 修改指定访问令牌的名称等配置；委托业务服务执行。
 * @param context /api/user/token/update 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserTokenUpdate = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenUpdate(context, runtime)

/**
 * 切换指定访问令牌的启用状态；委托业务服务执行。
 * @param context /api/user/token/toggle 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserTokenToggle = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postUserTokenToggle(context, runtime)

/**
 * 查询用户令牌访问日志；委托业务服务执行。
 * @param context /api/user/token/logs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserTokenLogs = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getUserTokenLogs(context, runtime)

/**
 * 向播放器返回认证开关等公开配置；委托业务服务执行。
 * @param context /api/music/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicConfig = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getMusicConfig(context, runtime)

/**
 * 校验播放器访问密码并创建访问会话；委托业务服务执行。
 * @param context /api/music/auth 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicAuth = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postMusicAuth(context, runtime)

/**
 * 删除播放器访问会话并清除 Cookie；委托业务服务执行。
 * @param context /api/music/auth/logout 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postMusicAuthLogout = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.postMusicAuthLogout(context, runtime)

/**
 * 检查播放器访问会话是否有效；委托业务服务执行。
 * @param context /api/music/auth/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getMusicAuthVerify = (context: RequestContext, runtime: AuthenticationServiceRuntime) => service.getMusicAuthVerify(context, runtime)
