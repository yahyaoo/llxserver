import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 播放器扩展兼容数据实体，对应 music_legacy_document 表。valueJson 保存未单独归类的扩展业务文档，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface LegacyDocumentEntity extends BaseEntity {}

