import type { ApiTokenRecord } from '../entity/ApiTokenEntity'
/** 令牌仓储写入参数，须经账号身份校验。 */
export interface ApiTokenDto extends ApiTokenRecord {}
