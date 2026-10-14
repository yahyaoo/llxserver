import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 自定义音源脚本校验、导入、启用配置与排序所需的应用依赖契约。 @author yahyaoo */
export type SourceServiceRuntime = Pick<ServerRuntime, 'customSourceHandlers' | 'verifyUserAuth'>
/** 自定义音源脚本校验、导入、启用配置与排序服务。 @author yahyaoo */

/**
 * 校验上传音源脚本并解析平台能力。
 * @param context /api/custom-source/validate 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceValidate(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

  const isAdmin = req.headers['x-frontend-auth'] === global.lx.config['frontend.password']
  if (!verifyUserAuth(req) && !isAdmin) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ valid: false, error: '请先登录账号，再添加个人自定义源。' }))
    return
  }

        return customSourceHandlers.handleValidate(req, res)

}

/**
 * 从远端地址导入自定义音源脚本。
 * @param context /api/custom-source/import 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceImport(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

        return customSourceHandlers.handleImport(req, res, verifyUserAuth(req) || 'open')

}

/**
 * 保存上传的自定义音源脚本及注册信息。
 * @param context /api/custom-source/upload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceUpload(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

        return customSourceHandlers.handleUpload(req, res, verifyUserAuth(req) || 'open')

}

/**
 * 查询用户可见的自定义音源列表。
 * @param context /api/custom-source/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getCustomSourceList(context: RequestContext, runtime: SourceServiceRuntime) {
  const { urlObj, req, res } = context
  const { verifyUserAuth, customSourceHandlers } = runtime

        const username = verifyUserAuth(req) || 'default'

        // 鉴权逻辑：如果开启了页面公开访问限制
        if (global.lx.config['user.enablePublicRestriction']) {
          const auth = req.headers['x-frontend-auth']
          const isAdmin = auth === global.lx.config['frontend.password']
          const user = verifyUserAuth(req)
          if (!isAdmin && !user) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: '当前系统已开启公开访问限制，请登录后重试。' }))
            return
          }
        }

        return customSourceHandlers.handleList(req, res, username)

}

/**
 * 切换指定音源的启用状态。
 * @param context /api/custom-source/toggle 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceToggle(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

        return customSourceHandlers.handleToggle(req, res, verifyUserAuth(req) || 'open')

}

/**
 * 删除指定音源脚本及注册信息。
 * @param context /api/custom-source/delete 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceDelete(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

        return customSourceHandlers.handleDelete(req, res, verifyUserAuth(req) || 'open')

}

/**
 * 保存自定义音源优先级顺序。
 * @param context /api/custom-source/reorder 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceReorder(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

        return customSourceHandlers.handleReorder(req, res, verifyUserAuth(req) || 'open')

}

/**
 * 更新音源的平台启用配置。
 * @param context /api/custom-source/update-platforms 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自定义音源脚本校验、导入、启用配置与排序的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postCustomSourceUpdatePlatforms(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers, verifyUserAuth } = runtime

        return customSourceHandlers.handleUpdatePlatforms(req, res, verifyUserAuth(req) || 'open')

}
