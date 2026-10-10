import fs from 'node:fs'
import path from 'node:path'
import { parseStaticConfiguration as parseLegacyConfiguration } from '../../common/configuration/StaticConfigurationParser'

/** 数据库引导配置，只写 config.js，不写业务表。 @author yahyaoo */
export interface DatabasePaths {
  /** 管理数据库文件路径。 */
  'database.adminPath': string
  /** 播放数据库文件路径。 */
  'database.musicPath': string
}
/** @param root 数据目录。 @returns 引导文件位置。 @author yahyaoo */
export function bootstrapFilename(root: string): string { return path.resolve(process.env.CONFIG_PATH || path.join(root, 'config.js')) }

/** @param root 数据目录。 @returns 两库位置；旧文件的业务字段不加载。 @author yahyaoo */
export function readDatabasePaths(root: string): DatabasePaths {
  const filename = bootstrapFilename(root), fallback = path.join(process.cwd(), 'config.js')
  const file = fs.existsSync(filename) ? filename : fallback
  const config = fs.existsSync(file) ? parseLegacyConfiguration(fs.readFileSync(file, 'utf8')) : {}
  const resolve = (key: string, basename: string) => {
    const value = config[key]
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value))) throw new Error('数据库路径格式错误：' + key)
    return path.resolve(root, value || 'database/' + basename)
  }
  const paths = { 'database.adminPath': resolve('database.adminPath', 'admin.sqlite'), 'database.musicPath': resolve('database.musicPath', 'music.sqlite') }
  const samePath = process.platform === 'win32'
    ? paths['database.adminPath'].toLowerCase() === paths['database.musicPath'].toLowerCase()
    : paths['database.adminPath'] === paths['database.musicPath']
  if (samePath) throw new Error('管理库与播放库必须使用不同文件')
  return paths
}
/**
 * 原子保存引导路径。首次精简旧文件前保留原文供管理员手动导入。
 * @param root 数据目录。 @param paths 已验证位置。 @throws Error 文件写入失败。
 * @author yahyaoo
 */
export function writeDatabasePaths(root: string, paths: DatabasePaths): void {
  const filename = bootstrapFilename(root)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  if (fs.existsSync(filename)) {
    const original = fs.readFileSync(filename, 'utf8'), config = parseLegacyConfiguration(original)
    if (Object.keys(config).some(key => !['database.adminPath', 'database.musicPath'].includes(key))) {
      const backup = filename + '.legacy.js'
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' })
    }
  }
  const temporary = filename + '.tmp-' + process.pid
  try {
    fs.writeFileSync(temporary, '/** SQLite 引导配置，仅保存数据库位置。 @author yahyaoo */\nmodule.exports = ' + JSON.stringify(paths, null, 2) + '\n')
    fs.renameSync(temporary, filename)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}
