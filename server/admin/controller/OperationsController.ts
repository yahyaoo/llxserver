import type { OperationsServiceRuntime } from '../service/OperationsService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/OperationsService'
/** 管理认证、运行监控、日志、数据重载和文件管理的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 验证管理员密码并返回登录结果；委托业务服务执行。
 * @param context /api/login 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postLogin = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postLogin(context, runtime)

/**
 * 查询服务器资源用量、用户和同步连接状态；委托业务服务执行。
 * @param context /api/status 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getStatus = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getStatus(context, runtime)

/**
 * 向更新服务器查询可用发布版本；委托业务服务执行。
 * @param context /api/app/update/check 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getAppUpdateCheck = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getAppUpdateCheck(context, runtime)

/**
 * 校验请求中的管理员凭据；委托业务服务执行。
 * @param context /api/admin/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postAdminVerify = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postAdminVerify(context, runtime)

/**
 * 处理文件管理器操作并校验允许访问的目录；委托业务服务执行。
 * @param context /api/elfinder/connector 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleElfinderConnector = (context: RequestContext, runtime: OperationsServiceRuntime) => service.handleElfinderConnector(context, runtime)

/**
 * 读取系统日志，支持筛选和分页；委托业务服务执行。
 * @param context /api/logs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getLogs = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getLogs(context, runtime)

/**
 * 统计用户歌曲、列表及存储信息；委托业务服务执行。
 * @param context /api/stats 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getStats = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getStats(context, runtime)

/**
 * 从数据库刷新配置、用户和音源数据；委托业务服务执行。
 * @param context /api/admin/reload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postAdminReload = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postAdminReload(context, runtime)

/**
 * 响应重启请求并终止当前服务进程；委托业务服务执行。
 * @param context /api/restart 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postRestart = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postRestart(context, runtime)

/**
 * 列出指定数据目录中的文件；委托业务服务执行。
 * @param context /api/files 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getFiles = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getFiles(context, runtime)

/**
 * 返回指定数据文件的下载内容；委托业务服务执行。
 * @param context /api/files/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getFilesDownload = (context: RequestContext, runtime: OperationsServiceRuntime) => service.getFilesDownload(context, runtime)

/**
 * 向指定数据路径写入上传文件；委托业务服务执行。
 * @param context /api/files 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postFiles = (context: RequestContext, runtime: OperationsServiceRuntime) => service.postFiles(context, runtime)

/**
 * 删除指定的数据文件；委托业务服务执行。
 * @param context /api/files 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const deleteFiles = (context: RequestContext, runtime: OperationsServiceRuntime) => service.deleteFiles(context, runtime)
