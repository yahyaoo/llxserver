import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** Source 服务所需能力，仅允许访问本模块使用的依赖。 @author yahyaoo */
export type SourceServiceRuntime = Pick<ServerRuntime, 'customSourceHandlers' | 'verifyUserAuth'>
/** Source 业务服务，原路由处理顺序与错误响应保持不变。 @author yahyaoo */

/**
 * 处理 /api/custom-source/validate 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceValidate(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleValidate(req, res)

}

/**
 * 处理 /api/custom-source/import 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceImport(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleImport(req, res)

}

/**
 * 处理 /api/custom-source/upload 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceUpload(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleUpload(req, res)

}

/**
 * 处理 /api/custom-source/list 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function getCustomSourceList(context: RequestContext, runtime: SourceServiceRuntime) {
  const { urlObj, req, res } = context
  const { verifyUserAuth, customSourceHandlers } = runtime

        const username = urlObj.searchParams.get('username') || 'default'

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
 * 处理 /api/custom-source/toggle 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceToggle(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleToggle(req, res)

}

/**
 * 处理 /api/custom-source/delete 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceDelete(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleDelete(req, res)

}

/**
 * 处理 /api/custom-source/reorder 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceReorder(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleReorder(req, res)

}

/**
 * 处理 /api/custom-source/update-platforms 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postCustomSourceUpdatePlatforms(context: RequestContext, runtime: SourceServiceRuntime) {
  const { req, res } = context
  const { customSourceHandlers } = runtime

        return customSourceHandlers.handleUpdatePlatforms(req, res)

}
