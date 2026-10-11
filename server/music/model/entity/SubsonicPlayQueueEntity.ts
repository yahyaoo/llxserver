import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** Subsonic 播放队列实体，对应 client_subsonic_play_queue 表。valueJson 保存Subsonic 播放队列与当前位置，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SubsonicPlayQueueEntity extends BaseEntity {}

