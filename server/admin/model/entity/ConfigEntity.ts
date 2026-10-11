import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 全局服务配置实体，对应 server_config 表。valueJson 保存系统业务配置键和值，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface ConfigEntity extends BaseEntity {}

