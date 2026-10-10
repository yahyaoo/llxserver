import path from 'node:path'
import defaultConfig from '../../defaultConfig'
import { createAdminRepository } from '../../admin/repository/AdminRepository'
import { GlobalConfigurationService } from '../../admin/service/GlobalConfigurationService'
import { readDatabasePaths, writeDatabasePaths, bootstrapFilename } from './BootstrapConfiguration'

/**
 * 飞牛安装向导的配置初始化入口。只在管理库没有系统配置时写入向导值。
 * 引导文件仅保存两个数据库位置；升级安装保留已有 SQL 配置和旧文件导入副本。
 * @param root 安装共享空间中的业务数据目录。
 * @param values 安装向导业务配置；覆盖默认值，但不覆盖已有 SQL 配置。
 * @returns 首次写入返回 true；已经配置时返回 false。
 * @throws Error 数据库打开、写入或引导文件保存失败。
 * @author yahyaoo
 */
export function initializeInstallationConfiguration(root: string, values: Partial<LX.Config>): boolean {
  const paths = readDatabasePaths(root)
  const repository = createAdminRepository(root, paths['database.adminPath'])
  try {
    const filename = bootstrapFilename(root)
    const existing = repository.read('server_config', path.join(root, 'system-configuration.json')) || repository.read('server_config', filename)
    writeDatabasePaths(root, paths)
    if (existing) return false
    new GlobalConfigurationService(repository).save(filename, { ...defaultConfig, ...values })
    return true
  } finally { repository.close() }
}

// 向导值通过进程环境传入，不将密码插入可执行脚本或日志。
if (require.main === module) {
  if (!process.env.DATA_PATH) throw new Error('缺少安装数据目录 DATA_PATH')
  initializeInstallationConfiguration(path.resolve(process.env.DATA_PATH), {
    port: 17000, 'frontend.password': process.env.LX_INSTALL_ADMIN_PASSWORD || '123456',
    'player.password': process.env.LX_INSTALL_PLAYER_PASSWORD || '123456', 'player.enableAuth': true,
    'player.path': '/music', disableTelemetry: true, 'subsonic.enable': false,
  })
}
