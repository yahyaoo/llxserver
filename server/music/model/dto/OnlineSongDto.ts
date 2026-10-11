import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** Subsonic 在线歌曲解析缓存的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface OnlineSongDto extends DocumentWriteDto {}

