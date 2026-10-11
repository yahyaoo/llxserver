import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** Subsonic 播放书签实体，对应 client_subsonic_bookmark 表。valueJson 保存Subsonic 歌曲播放位置与书签备注，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SubsonicBookmarkEntity extends BaseEntity {}

