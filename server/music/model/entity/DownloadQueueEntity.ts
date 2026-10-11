import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 服务器下载队列实体，对应 client_download_queue 表。valueJson 保存服务器下载任务状态和队列顺序，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface DownloadQueueEntity extends BaseEntity {}

