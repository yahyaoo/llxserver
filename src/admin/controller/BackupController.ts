import type { BackupServiceRuntime } from '../service/BackupService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/BackupService'
/** Backup 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/webdav/test 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postWebdavTest = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavTest(context, runtime)

/** @param context /api/webdav/sync-file 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postWebdavSyncFile = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavSyncFile(context, runtime)

/** @param context /api/webdav/backup 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postWebdavBackup = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavBackup(context, runtime)

/** @param context /api/webdav/sync 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postWebdavSync = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavSync(context, runtime)

/** @param context /api/webdav/backups 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getWebdavBackups = (context: RequestContext, runtime: BackupServiceRuntime) => service.getWebdavBackups(context, runtime)

/** @param context /api/webdav/backup 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const deleteWebdavBackup = (context: RequestContext, runtime: BackupServiceRuntime) => service.deleteWebdavBackup(context, runtime)

/** @param context /api/webdav/restore 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postWebdavRestore = (context: RequestContext, runtime: BackupServiceRuntime) => service.postWebdavRestore(context, runtime)

/** @param context /api/webdav/logs 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getWebdavLogs = (context: RequestContext, runtime: BackupServiceRuntime) => service.getWebdavLogs(context, runtime)

/** @param context /api/webdav/progress 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getWebdavProgress = (context: RequestContext, runtime: BackupServiceRuntime) => service.getWebdavProgress(context, runtime)

/** @param context /api/backup/download 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const getBackupDownload = (context: RequestContext, runtime: BackupServiceRuntime) => service.getBackupDownload(context, runtime)

/** @param context /api/backup/upload 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const postBackupUpload = (context: RequestContext, runtime: BackupServiceRuntime) => service.postBackupUpload(context, runtime)
