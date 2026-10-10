import * as client from './UpdateClient'

/** 更新服务器接口，保留版本比较和地址校验规则。 @author yahyaoo */
export interface UpdateGateway {
  /** 原更新查询。 */
  checkAppUpdate: typeof client.checkAppUpdate
  /** 原地址校验。 */
  validateUpdateServer: typeof client.validateUpdateServer
  /** 原版本比较。 */
  compareAppVersions: typeof client.compareAppVersions
}
/** 默认更新网关。 @author yahyaoo */
export const updateGateway: UpdateGateway = client
export const { checkAppUpdate, validateUpdateServer, compareAppVersions } = updateGateway
export const DEFAULT_UPDATE_SERVER = client.DEFAULT_UPDATE_SERVER
