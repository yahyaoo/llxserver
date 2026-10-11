import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 浏览器设备歌单同步状态的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface BrowserStateDto extends DocumentWriteDto {}

