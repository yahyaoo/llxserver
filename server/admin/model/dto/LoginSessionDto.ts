import type { LoginSessionEntity } from '../entity/LoginSessionEntity'
/** 仓储写入参数，不允许从未认证请求直接构造。 */
export interface LoginSessionDto extends LoginSessionEntity {}
