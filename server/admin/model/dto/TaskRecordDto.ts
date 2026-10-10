import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 网络歌单更新任务的执行记录的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface TaskRecordDto extends DocumentWriteDto {}

