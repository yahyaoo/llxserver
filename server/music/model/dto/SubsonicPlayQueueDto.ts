import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** Subsonic 播放队列与当前位置的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface SubsonicPlayQueueDto extends DocumentWriteDto {}

