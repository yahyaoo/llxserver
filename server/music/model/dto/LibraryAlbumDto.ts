import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 收藏或屏蔽的专辑条目的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface LibraryAlbumDto extends DocumentWriteDto {}

