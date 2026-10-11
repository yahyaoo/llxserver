import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** Subsonic 播放记录实体，对应 client_subsonic_scrobble 表。valueJson 保存Subsonic 歌曲播放记录，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SubsonicScrobbleEntity extends BaseEntity {}

