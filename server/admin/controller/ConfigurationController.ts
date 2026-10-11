import type { ConfigurationServiceRuntime } from '../service/ConfigurationService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/ConfigurationService'
/** 系统配置、旧配置导入、本地配置备份与代理连接测试的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 读取或保存系统配置；业务字段写管理库，数据库位置写引导文件；委托业务服务执行。
 * @param context /api/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleConfig = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.handleConfig(context, runtime)

/**
 * 列出本地配置导出备份及保留策略；委托业务服务执行。
 * @param context /api/config/backups 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getConfigBackups = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.getConfigBackups(context, runtime)

/**
 * 导出当前 SQL 系统配置并创建本地备份；委托业务服务执行。
 * @param context /api/config/backup-now 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postConfigBackupNow = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigBackupNow(context, runtime)

/**
 * 下载指定本地配置备份文件；委托业务服务执行。
 * @param context /api/config/backups/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getConfigBackupsDownload = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.getConfigBackupsDownload(context, runtime)

/**
 * 删除指定本地配置备份；委托业务服务执行。
 * @param context /api/config/backups/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const deleteConfigBackups = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.deleteConfigBackups(context, runtime)

/**
 * 导入选定配置备份并热加载运行数据；委托业务服务执行。
 * @param context /api/config/backups/restore 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postConfigBackupsRestore = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigBackupsRestore(context, runtime)

/**
 * 使用提交的代理地址测试外网连接和响应耗时；委托业务服务执行。
 * @param context /api/config/test-proxy 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postConfigTestProxy = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigTestProxy(context, runtime)

/**
 * 静态解析上传的旧 config.js，在管理库事务中覆盖提供的配置项；委托业务服务执行。
 * @param context 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postConfigurationImport = (context: RequestContext, runtime: ConfigurationServiceRuntime) => service.postConfigurationImport(context, runtime)
