import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 管理用户实体，对应 server_user 表。valueJson 保存用户名称、连接密码与高级权限设置，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface UserEntity extends BaseEntity {}

