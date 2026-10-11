import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 用户自动下载歌单配置与同步结果的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface SyncDownloadDto extends DocumentWriteDto {}

