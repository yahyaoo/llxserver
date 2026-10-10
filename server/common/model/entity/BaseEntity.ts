/**
 * 所有业务表的公共持久化字段；实体采用驼峰命名，SQL 列采用小写下划线。
 * 联合主键为 document_key + record_key，字段不注入原业务响应。
 * 数组一项对应一行，对象一个顶层属性对应一行；未知平台字段保留在 value_json。
 * @author yahyaoo
 */
export interface BaseEntity {
  /** 对应 document_key：相对数据根目录的作用域，隔离用户及歌曲目录。 */
  documentKey: string
  /** 对应 record_key：原对象属性名或数组位置，与作用域构成联合主键。 */
  recordKey: string
  /** 对应 sort_order：原始插入顺序，保留数组及对象迭代行为。 */
  sortOrder: number
  /** 对应 value_json：原记录无损序列化，音乐平台的未知字段也保留。 */
  valueJson: string
  /** 对应 created_at：此作用域中记录首次写入时间，更新时保留，单位毫秒。 */
  createdAt: number
  /** 对应 updated_at：最近写入时间，单位毫秒。 */
  updatedAt: number
}
