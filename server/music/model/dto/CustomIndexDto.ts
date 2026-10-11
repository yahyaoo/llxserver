import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 用户自定义歌曲目录的音频索引的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface CustomIndexDto extends DocumentWriteDto {}

