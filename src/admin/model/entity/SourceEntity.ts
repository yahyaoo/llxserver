import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 第三方音源注册元数据实体，对应 admin_source 表。valueJson 保存音源脚本注册元数据，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SourceEntity extends BaseEntity {}

