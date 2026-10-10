import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 用户自定义歌曲目录索引实体，对应 music_custom_index 表。valueJson 保存用户自定义歌曲目录的音频索引，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface CustomIndexEntity extends BaseEntity {}

