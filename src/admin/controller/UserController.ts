import type { UserServiceRuntime } from '../service/UserService'
import type { RequestContext } from '../../common/http/RequestContext'
import * as service from '../service/UserService'
/** User 控制器：只转交请求，不承载存储与第三方调用。 @author yahyaoo */

/** @param context /api/users 原请求。 @param runtime 注入的服务能力。 @returns 服务处理结果。 */
export const handleUsers = (context: RequestContext, runtime: UserServiceRuntime) => service.handleUsers(context, runtime)
