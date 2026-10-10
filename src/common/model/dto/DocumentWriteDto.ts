/** 完整业务文档的仓储写入参数，包含文档作用域、业务内容和可选修改时间。 @author yahyaoo */
export interface DocumentWriteDto<T = unknown> {
  /** 文档作用域。 */
  documentKey: string
  /** 原始业务值。 */
  value: T
  /** 历史快照时间；省略时使用当前时间。 */
  modifiedAt?: number
}
