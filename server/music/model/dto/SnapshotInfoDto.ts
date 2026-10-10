import type { DocumentWriteDto } from '../../../common/model/dto/DocumentWriteDto'
/** 快照顺序、版本标识和设备同步游标的仓储写入参数；documentKey 定位文档，value 提供业务内容，modifiedAt 可指定更新时间。 @author yahyaoo */
export interface SnapshotInfoDto extends DocumentWriteDto {}

