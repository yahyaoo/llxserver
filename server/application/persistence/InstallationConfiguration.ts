import path from 'node:path'
import defaultConfig from '../../defaultConfig'
import { createAdminRepository } from '../../admin/repository/AdminRepository'
import { GlobalConfigurationService } from '../../admin/service/GlobalConfigurationService'
import { readDatabasePaths, writeDatabasePaths, bootstrapFilename } from './BootstrapConfiguration'

/**
 * 飞牛安装配置初始化入口。首次安装创建默认账号，旧安装只修复空账号列表。
 * 引导文件仅保存两个数据库位置；升级保留已有账号密码与其他 SQL 配置。
 * @param root 安装共享空间中的业务数据目录。
 * @param values 安装向导业务配置；覆盖默认值，但不覆盖已有 SQL 配置。
 * @returns 首次写入或修复空账号返回 true；已有账号时返回 false。
 * @throws Error 数据库打开、写入或引导文件保存失败。
 * @author jingyh
 */
export function initializeInstallationConfiguration(root: string, values: Partial<LX.Config>): boolean {
  const paths = readDatabasePaths(root)
  const repository = createAdminRepository(root, paths['database.adminPath'])
  try {
    const filename = bootstrapFilename(root)
    const existing = repository.read('server_config', path.join(root, 'system-configuration.json')) || repository.read('server_config', filename)
    writeDatabasePaths(root, paths)
    const config = (existing?.value as { config?: LX.Config } | undefined)?.config
    if (existing && !config) throw new Error('已有安装配置无效，请检查管理数据库')
    const userFilename = path.join(root, 'users.json')
    const storedUsers = repository.read('server_user', userFilename)?.value
    if (storedUsers !== undefined && !Array.isArray(storedUsers)) throw new Error('已有账号数据无效，请检查管理数据库')
    // 独立用户表优先，不能用配置副本中的旧密码覆盖用户在网页里修改的密码。
    const users = Array.isArray(storedUsers) ? storedUsers : (config?.users ?? values.users ?? [])
    if (existing && users.length) return false
    const initialUsers = users.length ? users : [{ name: 'admin', password: '123456' }]
    repository.transaction(() => {
      new GlobalConfigurationService(repository).save(filename, { ...(config ?? { ...defaultConfig, ...values }), users: initialUsers })
      repository.write('server_user', userFilename, JSON.stringify(initialUsers))
    })
    return true
  } finally { repository.close() }
}

// 安装向导不再收集密码；访问密码沿用默认配置，账号密码可在安装后修改。作者：jingyh
if (require.main === module) {
  if (!process.env.DATA_PATH) throw new Error('缺少安装数据目录 DATA_PATH')
  initializeInstallationConfiguration(path.resolve(process.env.DATA_PATH), {
    port: 17000, 'player.enableAuth': true,
    'player.path': '/music', disableTelemetry: true, 'subsonic.enable': false,
  })
}
