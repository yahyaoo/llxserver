import fs from 'node:fs'
import crypto from 'node:crypto'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'

/** 全局配置服务。SQL 是运行配置来源，config.js 保留外部编辑和旧备份兼容。 @author yahyaoo */
export class GlobalConfigurationService {
  /** @param repository 应用注入的管理库仓储。 */
  constructor(private readonly repository: SqliteDocumentRepository) {}

  /** @param filename 外部配置路径。 @returns 文件摘要，不存在时返回空字符串。 */
  private hash(filename: string): string {
    return fs.existsSync(filename) ? crypto.createHash('md5').update(fs.readFileSync(filename)).digest('hex') : ''
  }

  /** @param filename 配置路径。 @param parseLegacy 原解析过程。 @returns 原配置对象，字段与优先级不变。 */
  load(filename: string, parseLegacy: () => LX.Config): LX.Config {
    const saved = this.repository.read('admin_config', filename)
    const currentHash = this.hash(filename)
    const document = saved?.value as { /**
 * config 字段，沿用原业务结构与空值约定。
 */
config: LX.Config, /**
 * sourceHash 字段，沿用原业务结构与空值约定。
 */
sourceHash: string } | undefined
    if (document && (!currentHash || document.sourceHash === currentHash)) return document.config
    const config = parseLegacy()
    this.repository.write('admin_config', filename, JSON.stringify({ config, sourceHash: currentHash }))
    return config
  }

  /** @param filename 配置路径。 @param config 完整配置。 @param exportedText 兼容文件文本，用于区分内部导出与外部编辑。 */
  save(filename: string, config: LX.Config, exportedText: string): void {
    const sourceHash = crypto.createHash('md5').update(exportedText).digest('hex')
    this.repository.write('admin_config', filename, JSON.stringify({ config, sourceHash }))
  }
}
