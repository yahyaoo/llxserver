import type { OperationsServiceRuntime } from '../service/OperationsService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/OperationsService'
/** Operations 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/login 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postLogin = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postLogin(context, runtime)

/** @param context /api/status 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getStatus = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getStatus(context, runtime)

/** @param context /api/app/update/check 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getAppUpdateCheck = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getAppUpdateCheck(context, runtime)

/** @param context /api/admin/verify 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postAdminVerify = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postAdminVerify(context, runtime)

/** @param context /api/elfinder/connector 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleElfinderConnector = (context: RequestContext, runtime: OperationsServiceRuntime) => service.handleElfinderConnector(context, runtime)

/** @param context /api/logs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getLogs = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getLogs(context, runtime)

/** @param context /api/stats 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getStats = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getStats(context, runtime)

/** @param context /api/admin/reload 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postAdminReload = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postAdminReload(context, runtime)

/** @param context /api/restart 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postRestart = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postRestart(context, runtime)

/** @param context /api/files 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getFiles = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getFiles(context, runtime)

/** @param context /api/files/download 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getFilesDownload = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getFilesDownload(context, runtime)

/** @param context /api/files 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postFiles = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postFiles(context, runtime)

/** @param context /api/files 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const deleteFiles = (context: RequestContext, runtime: OperationsServiceRuntime) => service.deleteFiles(context, runtime)
