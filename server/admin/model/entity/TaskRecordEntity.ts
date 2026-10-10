import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 定时任务执行记录实体，对应 server_task_record 表。valueJson 保存网络歌单更新任务的执行记录，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface TaskRecordEntity extends BaseEntity {}

