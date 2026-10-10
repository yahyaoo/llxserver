import type { SettingsServiceRuntime } from '../service/SettingsService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/SettingsService'
/** 用户播放器、音效和歌单自动下载设置的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 保存用户歌单自动下载设置；委托业务服务执行。
 * @param context /api/user/sync-download/settings 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户播放器、音效和歌单自动下载设置的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const putUserSyncDownloadSettings = (context: RequestContext, runtime: SettingsServiceRuntime) => service.putUserSyncDownloadSettings(context, runtime)

/**
 * 读取用户播放器设置；委托业务服务执行。
 * @param context /api/user/settings 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户播放器、音效和歌单自动下载设置的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserSettings = (context: RequestContext, runtime: SettingsServiceRuntime) => service.getUserSettings(context, runtime)

/**
 * 保存用户播放器设置；委托业务服务执行。
 * @param context /api/user/settings 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户播放器、音效和歌单自动下载设置的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserSettings = (context: RequestContext, runtime: SettingsServiceRuntime) => service.postUserSettings(context, runtime)

/**
 * 读取用户音效设置；委托业务服务执行。
 * @param context /api/user/sound-effects 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户播放器、音效和歌单自动下载设置的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getUserSoundEffects = (context: RequestContext, runtime: SettingsServiceRuntime) => service.getUserSoundEffects(context, runtime)

/**
 * 保存用户音效设置；委托业务服务执行。
 * @param context /api/user/sound-effects 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户播放器、音效和歌单自动下载设置的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postUserSoundEffects = (context: RequestContext, runtime: SettingsServiceRuntime) => service.postUserSoundEffects(context, runtime)
