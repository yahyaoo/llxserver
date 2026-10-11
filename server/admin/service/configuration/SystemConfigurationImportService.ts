import path from 'node:path'
import defaultConfig from '../../../defaultConfig'
import type { SqliteDocumentRepository } from '../../../common/persistence/SqliteDocumentRepository'
import type { ConfigurationImportVo } from '../../model/vo/ConfigurationImportVo'
import { GlobalConfigurationService } from '../GlobalConfigurationService'
import { parseLegacyConfiguration } from './LegacyConfigurationParser'
import { validateAdditionalConfiguration } from './SystemConfigurationFields'

/** 旧配置导入服务；全部验证通过后在一个管理库事务中写入配置和用户。 @author yahyaoo */
export class SystemConfigurationImportService {
  /** @param repository 管理库；不访问播放库。 */
  constructor(private readonly repository: SqliteDocumentRepository) {}

  /**
   * @param text 上传文件文本。 @param current 当前完整配置。 @param filename 原配置作用域。
   * @returns 事务提交后配置及不含敏感值的统计。
   * @throws Error 解析、字段校验或事务失败；原配置保持不变。
   */
  import(text: string, current: LX.Config, filename: string): { config: LX.Config, result: ConfigurationImportVo } {
    const parsed = parseLegacyConfiguration(text)
    const keys = Object.keys(parsed).filter(key => Object.prototype.hasOwnProperty.call(defaultConfig, key))
    if (!keys.length) throw new Error('文件中没有可导入的业务配置')
    const config = JSON.parse(JSON.stringify(current)) as LX.Config
    for (const key of keys) {
      const value = parsed[key], expected = (defaultConfig as any)[key]
      if (value === undefined && /^proxy\.(music|customSource|app)\.enabled$/.test(key)) { delete (config as any)[key]; continue }
      if (expected !== undefined && (Array.isArray(expected) ? !Array.isArray(value) : typeof value !== typeof expected)) throw new Error('配置字段类型错误：' + key)
      if (expected === undefined && typeof value !== 'boolean') throw new Error('代理开关必须为布尔值或 undefined')
      ;(config as any)[key] = value
    }
    validateAdditionalConfiguration(Object.fromEntries(keys.map(key => [key, parsed[key]])))
    if (!config['user.enablePath'] && !config['user.enableRoot']) throw new Error('必须至少开启一种用户连接方式')
    if (!['top', 'bottom'].includes(config['list.addMusicLocationType'])) throw new Error('添加歌曲位置无效')
    // 静态对象仍需校验业务取值，避免类型正确但选项无效的文件进入运行配置。
    const enums: Record<string, readonly string[]> = {
      'download.lyricMode': ['embedded', 'external'],
      'subsonic.onlineSearchMode': ['fallback', 'merge', 'local_only'],
      'subsonic.leaderboardSource': ['tx', 'wy', 'kg', 'kw', 'mg'],
      'subsonic.sharedListMode': ['leaderboard', 'playlist', 'both'],
      'subsonic.sharedListSort': ['hot', 'new'],
      'subsonic.dislikeDuetMode': ['any', 'all', 'primary'],
      'subsonic.quality.clientCapMode': ['hard', 'soft'],
    }
    for (const key of keys) {
      if (enums[key] && !enums[key].includes((config as any)[key])) throw new Error('配置选项无效：' + key)
    }
    const numbers: Record<string, [number, number]> = {
      maxSnapshotNum: [1, Number.MAX_SAFE_INTEGER], 'user.cacheSizeLimit': [1, Number.MAX_SAFE_INTEGER],
      'sync.interval': [1, Number.MAX_SAFE_INTEGER], 'sync.backupInterval': [1, Number.MAX_SAFE_INTEGER],
      'configBackup.retentionDays': [1, Number.MAX_SAFE_INTEGER], 'subsonic.port': [0, 65535],
      'subsonic.dislikeRating': [0, 5], 'artist.maxFetchPages': [1, 100],
    }
    for (const key of keys) {
      const range = numbers[key], number = (config as any)[key]
      const validNumber = key === 'subsonic.dislikeRating' ? Number.isFinite(number) : Number.isInteger(number)
      if (range && (!validNumber || number < range[0] || number > range[1])) throw new Error('配置数值超出有效范围：' + key)
    }
    const users = config.users, names = new Set<string>(), passwords = new Set<string>()
    for (const user of users) {
      if (!user || typeof user.name !== 'string' || !user.name.trim() || /[\/\\\x00-\x1f]/.test(user.name) || typeof user.password !== 'string' || !user.password || names.has(user.name)) throw new Error('用户名称、密码或重复用户配置无效')
      if (config['user.enableRoot'] && passwords.has(user.password)) throw new Error('根路径模式不能使用重复密码')
      for (const key of ['enableCustomMusicDir', 'allowOperateCustomMusicDir', 'allowWriteCustomMusicDir', 'enableAutoDownload']) {
        if ((user as any)[key] !== undefined && typeof (user as any)[key] !== 'boolean') throw new Error('用户开关格式错误：' + key)
      }
      if (user.maxSnapshotNum !== undefined && (!Number.isInteger(user.maxSnapshotNum) || user.maxSnapshotNum < 1)) throw new Error('用户快照数量无效')
      if (user['list.addMusicLocationType'] !== undefined && !['top', 'bottom'].includes(user['list.addMusicLocationType'])) throw new Error('用户添加歌曲位置无效')
      if (user.customMusicDir !== undefined && typeof user.customMusicDir !== 'string') throw new Error('用户歌曲目录格式错误')
      names.add(user.name); passwords.add(user.password)
      delete (user as any).dataPath
    }
    if (!config['singer.sourcePriority']?.every(source => source === 'tx' || source === 'wy')) throw new Error('歌手信息源优先级无效')
    const admin = (config['admin.path'] ?? '/admin').replace(/\/+$/, ''), player = (config['player.path'] ?? '/').replace(/\/+$/, '')
    if ((admin && !admin.startsWith('/')) || (player && !player.startsWith('/')) || admin === player || admin.startsWith('/api') || player.startsWith('/api')) throw new Error('管理与播放器访问路径无效')
    config['admin.path'] = admin
    config['player.path'] = player
    this.repository.transaction(() => {
      new GlobalConfigurationService(this.repository).save(filename, config)
      if (keys.includes('users')) this.repository.write('server_user', path.join(this.repository.rootPath, 'users.json'), JSON.stringify(users))
    })
    return { config, result: { success: true, imported: keys.length, ignored: Object.keys(parsed).filter(key => !keys.includes(key)), restartRequired: true } }
  }
}
