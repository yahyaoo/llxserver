import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** Subsonic 评分与收藏元数据实体，对应 client_subsonic_meta 表。valueJson 保存Subsonic 收藏、评分及扩展元数据，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SubsonicMetaEntity extends BaseEntity {}

