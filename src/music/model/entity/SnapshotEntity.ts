import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 歌单与屏蔽规则快照实体，对应 music_snapshot 表。valueJson 保存歌单或不喜欢规则的历史版本数据，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SnapshotEntity extends BaseEntity {}

