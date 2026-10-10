import type { SettingsServiceRuntime } from '../service/SettingsService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/SettingsService'
/** Settings 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/user/sync-download/settings 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const putUserSyncDownloadSettings = (context: RequestContext, runtime: SettingsServiceRuntime) => service.putUserSyncDownloadSettings(context, runtime)

/** @param context /api/user/settings 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserSettings = (context: RequestContext, runtime: SettingsServiceRuntime) => service.getUserSettings(context, runtime)

/** @param context /api/user/settings 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserSettings = (context: RequestContext, runtime: SettingsServiceRuntime) => service.postUserSettings(context, runtime)

/** @param context /api/user/sound-effects 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getUserSoundEffects = (context: RequestContext, runtime: SettingsServiceRuntime) => service.getUserSoundEffects(context, runtime)

/** @param context /api/user/sound-effects 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postUserSoundEffects = (context: RequestContext, runtime: SettingsServiceRuntime) => service.postUserSoundEffects(context, runtime)
