import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** Subsonic 在线歌曲缓存实体，对应 client_online_song 表。valueJson 保存Subsonic 在线歌曲解析缓存，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface OnlineSongEntity extends BaseEntity {}

