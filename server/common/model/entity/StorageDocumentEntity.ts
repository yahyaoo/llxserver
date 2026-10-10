/** 文档元数据实体，两库分别创建同名表且各自独立。 @author yahyaoo */
export interface StorageDocumentEntity {
  /** 注册业务表名称。 */
  tableName: string
  /** 文档作用域。 */
  documentKey: string
  /** 原数据顶层类型。 */
  valueKind: 'array' | 'object' | 'value' | 'text'
  /** 原始序列化文本，保留现有下载及响应格式。 */
  originalText: string
  /** 原文件时间或写入时间。 */
  modifiedAt: number
  /** 原始文本字节数。 */
  byteLength: number
  /** 是否有效，删除时保留迁移标记。 */
  present: 0 | 1
}

