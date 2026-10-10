/** 歌单快照存储：读写版本数据、设备游标并按数量清理历史。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import { throttle } from '../../../utils/common'
import fs from 'node:fs'
import path from 'node:path'
import { syncLog } from '../../../utils/log4js'
import { checkAndCreateDirSync } from '../../../utils'
import { getUserConfig, type UserDataManage } from '../../../user/data'
import { File } from '../../../constants'

/** 快照元数据，记录最新快照、历史列表和设备确认游标。 @author yahyaoo */
interface SnapshotInfo {
  /** 最新数据快照标识。 */
  latest: string | null

  time: number
  /** 记录列表。 */
  list: string[]
  /** 设备到已确认快照的映射。 */
  clients: Record<string, LX.Sync.List.ListInfo>
}
/** 管理用户数据快照的读取、写入、保留数量和设备游标。 @author yahyaoo */
export class SnapshotDataManage {

  userDataManage: UserDataManage
  /** 用户歌单持久化目录。 */
  listDir: string
  /** 用户历史快照目录。 */
  snapshotDir!: string
  /** 快照元数据文档路径。 */
  snapshotInfoFilePath!: string
  /** 快照时间、历史列表和设备游标。 */
  snapshotInfo: SnapshotInfo
  /** 设备同步快照游标。 */
  clientSnapshotKeys: string[]
  /** 快照元数据的节流写入函数。 */
  private readonly saveSnapshotInfoThrottle: () => void

  /**
 * 判断快照设备游标中是否存在指定客户端。
 * @param key 业务作用域或缓存键。
 * @author yahyaoo
 */
  isIncluedsDevice = (key: string) => {
    return this.clientSnapshotKeys.includes(key)
  }

  /**
 * 按快照保留数量清理旧快照，保留最新快照及设备引用信息。
 * @author yahyaoo
 */
  clearOldSnapshot = async () => {
    if (!this.snapshotInfo) return
    const snapshotList = this.snapshotInfo.list.filter(key => !this.isIncluedsDevice(key))
    // console.log(snapshotList.length, lx.config.maxSnapshotNum)
    const userMaxSnapshotNum = getUserConfig(this.userDataManage.userName).maxSnapshotNum
    let requiredSave = snapshotList.length > userMaxSnapshotNum
    while (snapshotList.length > userMaxSnapshotNum) {
      const name = snapshotList.pop()
      if (name) {
        await this.removeSnapshot(name)
        this.snapshotInfo.list.splice(this.snapshotInfo.list.indexOf(name), 1)
      } else break
    }
    if (requiredSave) this.saveSnapshotInfo(this.snapshotInfo)
  }

  /**
 * 更新设备同步游标，并保存设备到快照的对应关系。
 * @param clientId 配对客户端标识。
 * @param key 业务作用域或缓存键。
 * @author yahyaoo
 */
  updateDeviceSnapshotKey = async (clientId: string, key: string) => {
    // console.log('updateDeviceSnapshotKey', key)
    let client = this.snapshotInfo.clients[clientId]
    if (!client) client = this.snapshotInfo.clients[clientId] = { snapshotKey: '', lastSyncDate: 0 }
    if (client.snapshotKey) this.clientSnapshotKeys.splice(this.clientSnapshotKeys.indexOf(client.snapshotKey), 1)
    client.snapshotKey = key
    client.lastSyncDate = Date.now()
    this.clientSnapshotKeys.push(key)
    this.saveSnapshotInfoThrottle()
  }

  /**
 * 读取设备已确认同步到的快照标识。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    // console.log('updateDeviceSnapshotKey', key)
    const client = this.snapshotInfo.clients[clientId]
    return client?.snapshotKey
  }

  /**
 * 读取快照元数据，包含最新标识、生成时间和设备游标。
 * @author yahyaoo
 */
  getSnapshotInfo = async (): Promise<SnapshotInfo> => {
    return this.snapshotInfo
  }

  /**
 * 保存快照元数据，合并当前设备游标与快照列表。
 * @param info 待保存业务条目。
 * @author yahyaoo
 */
  saveSnapshotInfo = (info: SnapshotInfo) => {
    this.snapshotInfo = info
    this.saveSnapshotInfoThrottle()
  }

  /**
 * 从快照元数据中删除指定快照标识。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
  removeSnapshotInfo = (clientId: string) => {
    let client = this.snapshotInfo.clients[clientId]
    if (!client) return
    if (client.snapshotKey) this.clientSnapshotKeys.splice(this.clientSnapshotKeys.indexOf(client.snapshotKey), 1)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.snapshotInfo.clients[clientId]
    this.saveSnapshotInfoThrottle()
  }

  /**
 * 读取指定快照中的完整用户数据。
 * @param name 对象名称或归档内相对名称。
 * @author yahyaoo
 */
  getSnapshot = async (name: string) => {
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    let listData: LX.Sync.List.ListData
    try {
      listData = JSON.parse((await storageFs.promises.readFile(filePath)).toString('utf-8'))
    } catch (err) {
      syncLog.warn(err)
      return null
    }
    return listData
  }

  /**
 * 保存完整数据快照并更新最新标识。
 * @param name 对象名称或归档内相对名称。
 * @param data 需要保存或转换的数据。
 * @author yahyaoo
 */
  saveSnapshot = async (name: string, data: string) => {
    syncLog.info('saveSnapshot', this.userDataManage.userName, name)
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    try {
      storageFs.writeFileSync(filePath, data)
    } catch (err) {
      syncLog.error(err)
      throw err
    }
  }

  /**
 * 按指定历史时间保存快照，用于导入和恢复历史版本。
 * @param name 对象名称或归档内相对名称。
 * @param data 需要保存或转换的数据。
 * @param time 快照或记录时间，单位毫秒。
 * @author yahyaoo
 */
  saveSnapshotWithTime = async (name: string, data: string, time: number) => {
    syncLog.info('saveSnapshotWithTime', this.userDataManage.userName, name, time)
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    try {
      storageFs.writeFileSync(filePath, data)
      if (time) {
        const date = new Date(time)
        storageFs.utimesSync(filePath, date, date)
      }
    } catch (err) {
      syncLog.error(err)
      throw err
    }
  }

  /**
 * 删除选定快照数据并维护快照元数据。
 * @param name 对象名称或归档内相对名称。
 * @author yahyaoo
 */
  removeSnapshot = async (name: string) => {
    syncLog.info('removeSnapshot', this.userDataManage.userName, name)
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    try {
      storageFs.unlinkSync(filePath)
    } catch (err) {
      syncLog.error(err)
    }
  }

  /**
 * 列出快照标识、生成时间及相关元信息。
 * @author yahyaoo
 */
  getSnapshotListWithMeta = async () => {
    const list = []
    try {
      const files = await storageFs.promises.readdir(this.snapshotDir)
      for (const file of files) {
        if (!file.startsWith('snapshot_')) continue
        const name = file.replace('snapshot_', '')
        const filePath = path.join(this.snapshotDir, file)
        try {
          const stat = await storageFs.promises.stat(filePath)
          list.push({
            id: name,
            time: stat.mtimeMs,
            size: stat.size,
          })
        } catch (e) {
          // ignore missing files
        }
      }
    } catch (err) {
      syncLog.error(err)
    }
    // Sort by time desc
    return list.sort((a, b) => b.time - a.time)
  }

  /**
 * 清空设备快照游标，使设备下次重新比较同步基线。
 * @author yahyaoo
 */
  clearClients = () => {
    this.snapshotInfo.clients = {}
    this.clientSnapshotKeys = []
    this.saveSnapshotInfoThrottle()
  }

  /**
 * 更新当前数据使用的最新快照标识。
 * @param name 对象名称或归档内相对名称。
 * @author yahyaoo
 */
  setLatest = (name: string) => {
    this.snapshotInfo.latest = name
    this.saveSnapshotInfoThrottle()
  }


  /**
   * 动态更新快照目录并迁移历史数据（无需重启即时生效）
   * @param targetBackupPath 新的 snapshot.backupPath 配置字符串
   */
  updateSnapshotDir = (targetBackupPath?: string) => {
    const backupPathConf = (targetBackupPath !== undefined ? targetBackupPath : (global.lx.config['snapshot.backupPath'] || '')).trim()
    const oldSnapshotDir = this.snapshotDir
    let newSnapshotDir = ''

    if (backupPathConf) {
      try {
        const base = path.isAbsolute(backupPathConf)
          ? backupPathConf
          : path.join(global.lx.dataPath, backupPathConf)
        newSnapshotDir = path.join(base, this.userDataManage.userName, File.listSnapshotDir)
        checkAndCreateDirSync(newSnapshotDir)
      } catch (err) {
        syncLog.warn(`[Snapshot] 无法创建自定义快照目录 (${backupPathConf})，已安全回退到默认目录:`, err)
        newSnapshotDir = path.join(this.listDir, File.listSnapshotDir)
      }
    } else {
      newSnapshotDir = path.join(this.listDir, File.listSnapshotDir)
    }
    checkAndCreateDirSync(newSnapshotDir)

    // 确定源目录（从旧 snapshotDir 或默认 legacyDir 迁移）
    const sourceDir = oldSnapshotDir || path.join(this.listDir, File.listSnapshotDir)
    if (newSnapshotDir !== sourceDir && storageFs.existsSync(sourceDir)) {
      try {
        let count = 0
        for (const name of storageFs.readdirSync(sourceDir)) {
          const src = path.join(sourceDir, name)
          const dst = path.join(newSnapshotDir, name)
          if (!storageFs.existsSync(dst)) {
            try {
              storageFs.renameSync(src, dst)
              count++
            } catch (e) {
              syncLog.error(`[Snapshot] 迁移快照文件失败 (${name}):`, e)
            }
          }
        }
        if (count > 0) {
          syncLog.info(`[Snapshot] 用户 ${this.userDataManage.userName} 歌单快照迁移成功 (共 ${count} 个文件 -> ${newSnapshotDir})`)
        }
        if (storageFs.existsSync(sourceDir) && storageFs.readdirSync(sourceDir).length === 0) {
          try {
            storageFs.rmdirSync(sourceDir)
            // 向上递归清理空的父目录（如 data/snapshot/admin）
            let parent = path.dirname(sourceDir)
            while (parent && parent !== global.lx.dataPath && parent !== path.dirname(global.lx.dataPath)) {
              if (storageFs.existsSync(parent) && storageFs.readdirSync(parent).length === 0) {
                storageFs.rmdirSync(parent)
                parent = path.dirname(parent)
              } else {
                break
              }
            }
          } catch { }
        }
      } catch (err) {
        syncLog.error(`[Snapshot] 用户 ${this.userDataManage.userName} 歌单快照迁移失败:`, err)
      }
    }

    this.snapshotDir = newSnapshotDir
    this.snapshotInfoFilePath = path.join(this.snapshotDir, File.listSnapshotInfoJSON)
    const legacyInfoPath = path.join(this.listDir, File.listSnapshotInfoJSON)
    if (!storageFs.existsSync(this.snapshotInfoFilePath) && storageFs.existsSync(legacyInfoPath)) {
      try { storageFs.renameSync(legacyInfoPath, this.snapshotInfoFilePath) } catch (e) { syncLog.error('migrate snapshotInfo failed:', e) }
    }

    if (storageFs.existsSync(this.snapshotInfoFilePath)) {
      try {
        this.snapshotInfo = JSON.parse(storageFs.readFileSync(this.snapshotInfoFilePath).toString())
      } catch { }
    }
  }

  /**
 * 绑定用户快照目录，载入或初始化最新版本与设备游标。
 * @param userDataManage 当前用户空间的数据与快照管理器。
 * @author yahyaoo
 */
  constructor(userDataManage: UserDataManage) {
    this.userDataManage = userDataManage

    this.listDir = path.join(userDataManage.userDir, File.listDir)
    checkAndCreateDirSync(this.listDir)

    this.snapshotInfo = { latest: null, time: 0, list: [], clients: {} }
    this.updateSnapshotDir()

    this.saveSnapshotInfoThrottle = throttle(() => {
      storageFs.writeFile(this.snapshotInfoFilePath, JSON.stringify(this.snapshotInfo), 'utf8', (err) => {
        if (err) console.error(err)
        void this.clearOldSnapshot()
      })
    })

    this.clientSnapshotKeys = Object.values(this.snapshotInfo.clients).map(device => device.snapshotKey).filter(k => k)
  }
}
// type UserDataManages = Map<string, UserDataManage>

// export const createUserDataManage = (user: LX.UserConfig) => {
//   const manage = Object.create(userDataManage) as typeof userDataManage
//   manage.userDir = user.dataPath
// }
