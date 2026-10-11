import type { BackupServiceRuntime } from '../service/BackupService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/BackupService'
/** WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 使用提交的 WebDAV 地址和凭据测试连接；委托业务服务执行。
 * @param context /api/webdav/test 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postWebdavTest = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavTest(context, runtime)

/**
 * 同步指定业务文件到 WebDAV；委托业务服务执行。
 * @param context /api/webdav/sync-file 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postWebdavSyncFile = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavSyncFile(context, runtime)

/**
 * 创建完整业务数据备份并上传 WebDAV；委托业务服务执行。
 * @param context /api/webdav/backup 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postWebdavBackup = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavBackup(context, runtime)

/**
 * 触发 WebDAV 数据同步；委托业务服务执行。
 * @param context /api/webdav/sync 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postWebdavSync = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavSync(context, runtime)

/**
 * 列出 WebDAV 远端完整备份；委托业务服务执行。
 * @param context /api/webdav/backups 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getWebdavBackups = (context: RequestContext, runtime: BackupServiceRuntime) => service.getWebdavBackups(context, runtime)

/**
 * 删除指定 WebDAV 远端备份；委托业务服务执行。
 * @param context /api/webdav/backup 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const deleteWebdavBackup = (context: RequestContext, runtime: BackupServiceRuntime) => service.deleteWebdavBackup(context, runtime)

/**
 * 从选定 WebDAV 备份还原业务数据；委托业务服务执行。
 * @param context /api/webdav/restore 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postWebdavRestore = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavRestore(context, runtime)

/**
 * 查询 WebDAV 同步日志；委托业务服务执行。
 * @param context /api/webdav/logs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getWebdavLogs = (context: RequestContext, runtime: BackupServiceRuntime) => service.getWebdavLogs(context, runtime)

/**
 * 查询 WebDAV 同步和备份进度；委托业务服务执行。
 * @param context /api/webdav/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getWebdavProgress = (context: RequestContext, runtime: BackupServiceRuntime) => service.getWebdavProgress(context, runtime)

/**
 * 打包业务数据并返回 ZIP 下载；委托业务服务执行。
 * @param context /api/backup/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getBackupDownload = (context: RequestContext, runtime: BackupServiceRuntime) => service.getBackupDownload(context, runtime)

/**
 * 上传并解压业务数据备份以恢复用户数据；委托业务服务执行。
 * @param context /api/backup/upload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime WebDAV 同步、远端备份恢复和本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postBackupUpload = (context: RequestContext, runtime: BackupServiceRuntime) => service.postBackupUpload(context, runtime)
