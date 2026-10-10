import type { SourceServiceRuntime } from '../service/SourceService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/SourceService'
/** 自定义音源脚本校验、导入、启用配置与排序的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 校验上传音源脚本并解析平台能力；委托业务服务执行。
 * @param context /api/custom-source/validate 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceValidate = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceValidate(context, runtime)

/**
 * 从远端地址导入自定义音源脚本；委托业务服务执行。
 * @param context /api/custom-source/import 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceImport = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceImport(context, runtime)

/**
 * 保存上传的自定义音源脚本及注册信息；委托业务服务执行。
 * @param context /api/custom-source/upload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceUpload = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceUpload(context, runtime)

/**
 * 查询用户可见的自定义音源列表；委托业务服务执行。
 * @param context /api/custom-source/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getCustomSourceList = (context: RequestContext, runtime: SourceServiceRuntime) => service.getCustomSourceList(context, runtime)

/**
 * 切换指定音源的启用状态；委托业务服务执行。
 * @param context /api/custom-source/toggle 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceToggle = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceToggle(context, runtime)

/**
 * 删除指定音源脚本及注册信息；委托业务服务执行。
 * @param context /api/custom-source/delete 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceDelete = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceDelete(context, runtime)

/**
 * 保存自定义音源优先级顺序；委托业务服务执行。
 * @param context /api/custom-source/reorder 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceReorder = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceReorder(context, runtime)

/**
 * 更新音源的平台启用配置；委托业务服务执行。
 * @param context /api/custom-source/update-platforms 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const postCustomSourceUpdatePlatforms = (context: RequestContext, runtime: SourceServiceRuntime) => service.postCustomSourceUpdatePlatforms(context, runtime)
