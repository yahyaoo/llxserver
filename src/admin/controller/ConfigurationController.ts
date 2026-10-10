import type { ConfigurationServiceRuntime } from '../service/ConfigurationService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/ConfigurationService'
/** Configuration 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/config 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleConfig = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.handleConfig(context, runtime)

/** @param context /api/config/backups 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getConfigBackups = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.getConfigBackups(context, runtime)

/** @param context /api/config/backup-now 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postConfigBackupNow = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigBackupNow(context, runtime)

/** @param context /api/config/backups/download 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getConfigBackupsDownload = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.getConfigBackupsDownload(context, runtime)

/** @param context /api/config/backups/ 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const deleteConfigBackups = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.deleteConfigBackups(context, runtime)

/** @param context /api/config/backups/restore 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postConfigBackupsRestore = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigBackupsRestore(context, runtime)

/** @param context /api/config/test-proxy 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postConfigTestProxy = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigTestProxy(context, runtime)
