import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 服务器已下载歌曲实体，对应 client_download_record 表。valueJson 保存已下载歌曲的文件路径、音质与元信息，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface DownloadRecordEntity extends BaseEntity {}

