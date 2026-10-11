import type { DocumentTable } from '../../common/persistence/SqliteDocumentRepository'
/** 管理服务表映射，仅依赖公共持久化契约。 @author yahyaoo */
export const adminTables: DocumentTable[] = [
  /** 服务实例标识。 */
  { table: 'server_server_info', matches: filename => /serverInfo\.json$/.test(filename) },
  /** 管理用户。 */
  { table: 'server_user', matches: filename => /(?:^|\/)users\.json$/.test(filename) },
  /** 用户配对设备。 */
  { table: 'server_device', matches: filename => /devices\.json$/.test(filename) },
  /** 第三方音源注册元数据。 */
  { table: 'server_source', matches: filename => /sources\.json$/.test(filename) },
  /** 用户音源启用状态。 */
  { table: 'server_source_state', matches: filename => /states\.json$/.test(filename) },
  /** 用户音源优先级。 */
  { table: 'server_source_order', matches: filename => /order\.json$/.test(filename) },
  /** 全局服务配置。 */
  { table: 'server_config', matches: filename => /(?:__config__|system-configuration)\.json$/.test(filename) },
  /** 定时任务执行记录。 */
  { table: 'server_task_record', matches: filename => /network-list-autoupdate-records\.json$/.test(filename) },
  /** 管理扩展兼容数据。 */
  { table: 'server_legacy_document', matches: filename => /a^/.test(filename) },
]

