/** 仓储还原的业务文档，附带作用域、修改时间及序列化大小，供查询和备份使用。 @author yahyaoo */
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
