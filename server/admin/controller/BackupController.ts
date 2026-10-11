import type { BackupServiceRuntime } from '../service/BackupService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/BackupService'
/** 本地 ZIP 数据备份的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 打包业务数据并返回 ZIP 下载；委托业务服务执行。
 * @param context /api/backup/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getBackupDownload = (context: RequestContext, runtime: BackupServiceRuntime) => service.getBackupDownload(context, runtime)

/**
 * 上传并解压业务数据备份以恢复用户数据；委托业务服务执行。
 * @param context /api/backup/upload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postBackupUpload = (context: RequestContext, runtime: BackupServiceRuntime) => service.postBackupUpload(context, runtime)
