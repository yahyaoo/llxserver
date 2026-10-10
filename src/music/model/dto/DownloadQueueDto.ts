import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 服务器下载任务状态和队列顺序的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface DownloadQueueDto extends DocumentWriteDto {}

