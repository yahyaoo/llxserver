import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 播放器持久令牌实体，对应 client_token 表。valueJson 保存用户访问令牌和启用配置，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface TokenEntity extends BaseEntity {}

