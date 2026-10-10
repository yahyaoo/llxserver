import type { SourceServiceRuntime } from '../service/SourceService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/SourceService'
/** Source 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/custom-source/validate 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceValidate = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceValidate(context, runtime)

/** @param context /api/custom-source/import 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceImport = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceImport(context, runtime)

/** @param context /api/custom-source/upload 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceUpload = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceUpload(context, runtime)

/** @param context /api/custom-source/list 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getCustomSourceList = (context: RequestContext, runtime: SourceServiceRuntime) => service.getCustomSourceList(context, runtime)

/** @param context /api/custom-source/toggle 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceToggle = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceToggle(context, runtime)

/** @param context /api/custom-source/delete 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceDelete = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceDelete(context, runtime)

/** @param context /api/custom-source/reorder 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceReorder = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceReorder(context, runtime)

/** @param context /api/custom-source/update-platforms 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postCustomSourceUpdatePlatforms = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceUpdatePlatforms(context, runtime)
