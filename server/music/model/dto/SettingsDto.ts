import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 用户播放器偏好设置的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface SettingsDto extends DocumentWriteDto {}

