import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 歌单与屏蔽规则快照索引实体，对应 client_snapshot_info 表。valueJson 保存快照顺序、版本标识和设备同步游标，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SnapshotInfoEntity extends BaseEntity {}

