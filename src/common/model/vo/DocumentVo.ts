/** 数据访问层查询结果，控制器仍返回原有业务结构。 @author yahyaoo */
export interface DocumentVo<T = unknown> {
  /** 文档作用域。 */
  documentKey: string
  /** 原始业务值。 */
  value: T
  /** 文档更新时间。 */
  modifiedAt: number
  /** 原始文本字节数。 */
  byteLength: number
}
