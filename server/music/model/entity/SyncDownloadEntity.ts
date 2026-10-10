import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 用户同步下载配置及进度实体，对应 music_sync_download 表。valueJson 保存用户自动下载歌单配置与同步结果，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface SyncDownloadEntity extends BaseEntity {}

