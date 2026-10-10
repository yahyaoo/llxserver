/** 数据访问层写入参数，禁止用数据库字段替换原业务字段。 @author yahyaoo */
export interface DocumentWriteDto<T = unknown> {
  /** 文档作用域。 */
  documentKey: string
  /** 原始业务值。 */
  value: T
  /** 历史快照时间；省略时使用当前时间。 */
  modifiedAt?: number
}
