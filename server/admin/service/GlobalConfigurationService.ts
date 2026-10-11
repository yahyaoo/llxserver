import path from "node:path"
import type { SqliteDocumentRepository } from "../../common/persistence/SqliteDocumentRepository"
/** 全局配置服务。只读 SQLite，旧文件仅允许显式导入。 @author yahyaoo */
export class GlobalConfigurationService {
  /** @param repository 管理库仓储。 */
  constructor(private readonly repository: SqliteDocumentRepository) {}
  /** @param filename 配置作用域。 @param defaults 初始化默认值。 @returns SQL 配置。 */
  load(filename: string, defaults: LX.Config): LX.Config {
    const key = path.join(this.repository.rootPath, "system-configuration.json")
    const saved = (this.repository.read("server_config", key) || this.repository.read("server_config", filename))?.value as { config: LX.Config } | undefined
    if (saved?.config) { this.save(filename, saved.config); return saved.config }
    this.save(filename, defaults)
    return JSON.parse(JSON.stringify(defaults))
  }
  /** @param filename 配置作用域。 @param config 完整业务配置，引导字段不入库。 */
  save(filename: string, config: LX.Config): void {
    const saved = { ...config } as any
    delete saved["database.adminPath"]; delete saved["database.musicPath"]
    const key = path.join(this.repository.rootPath, "system-configuration.json")
    this.repository.transaction(() => {
      this.repository.write("server_config", key, JSON.stringify({ config: saved }))
      if (this.repository.read("server_config", filename)) this.repository.remove("server_config", filename)
    })
  }
  /** @param config 配置对象。 @returns 可下载和导入的备份文本。 */
  export(config: LX.Config): string { return "module.exports = " + JSON.stringify(config, null, 2) + "\n" }
}
