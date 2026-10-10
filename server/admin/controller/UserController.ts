import type { UserServiceRuntime } from '../service/UserService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/UserService'
/** 管理用户维护、用户空间迁移与同步连接处理的 HTTP 请求入口，委托对应服务执行。 @author yahyaoo */

/**
 * 查询、创建、修改或删除管理用户，并维护用户数据目录与连接；委托业务服务执行。
 * @param context /api/users 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理用户维护、用户空间迁移与同步连接处理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const handleUsers = (context: RequestContext, runtime: UserServiceRuntime) => service.handleUsers(context, runtime)
