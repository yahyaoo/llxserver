/** snapshotDataManage 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import { throttle } from '../../../utils/common'
import fs from 'node:fs'
import path from 'node:path'
import { syncLog } from '../../../utils/log4js'
import { checkAndCreateDirSync } from '../../../utils'
import { getUserConfig, type UserDataManage } from '../../../user/data'
import { File } from '../../../constants'

/**
 * SnapshotInfo 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
interface SnapshotInfo {
  /**
   * latest 字段，沿用原业务结构与空值约定。
   */
  latest: string | null
  /**
   * time 字段，沿用原业务结构与空值约定。
   */
  time: number
  /**
   * list 字段，沿用原业务结构与空值约定。
   */
  list: string[]
  /**
   * clients 字段，沿用原业务结构与空值约定。
   */
  clients: Record<string, LX.Sync.List.ListInfo>
}
/**
 * SnapshotDataManage 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export class SnapshotDataManage {
  /**
   * userDataManage 字段，沿用原业务结构与空值约定。
   */
  userDataManage: UserDataManage
  /**
   * listDir 字段，沿用原业务结构与空值约定。
   */
  listDir: string
  /**
   * snapshotDir 字段，沿用原业务结构与空值约定。
   */
  snapshotDir!: string
  /**
   * snapshotInfoFilePath 字段，沿用原业务结构与空值约定。
   */
  snapshotInfoFilePath!: string
  /**
   * snapshotInfo 字段，沿用原业务结构与空值约定。
   */
  snapshotInfo: SnapshotInfo
  /**
   * clientSnapshotKeys 字段，沿用原业务结构与空值约定。
   */
  clientSnapshotKeys: string[]
  /**
   * saveSnapshotInfoThrottle 字段，沿用原业务结构与空值约定。
   */
  private readonly saveSnapshotInfoThrottle: () => void

  /**
   * 判断 isIncluedsDevice 对应的业务能力，参数和执行顺序保持原实现。
   * @param key 业务作用域或缓存键。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  isIncluedsDevice = (key: string) => {
    return this.clientSnapshotKeys.includes(key)
  }

  /**
   * 清理 clearOldSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 更新 updateDeviceSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @param key 业务作用域或缓存键。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 获取 getDeviceCurrentSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    // console.log('updateDeviceSnapshotKey', key)
    const client = this.snapshotInfo.clients[clientId]
    return client?.snapshotKey
  }

  /**
   * 获取 getSnapshotInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getSnapshotInfo = async (): Promise<SnapshotInfo> => {
    return this.snapshotInfo
  }

  /**
   * 保存 saveSnapshotInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @param info 原业务元信息。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  saveSnapshotInfo = (info: SnapshotInfo) => {
    this.snapshotInfo = info
    this.saveSnapshotInfoThrottle()
  }

  /**
   * 移除 removeSnapshotInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 获取 getSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 保存 saveSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @param data 原业务数据，保留扩展字段。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 保存 saveSnapshotWithTime 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @param data 原业务数据，保留扩展字段。
   * @param time time 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 移除 removeSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 获取 getSnapshotListWithMeta 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 清理 clearClients 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  clearClients = () => {
    this.snapshotInfo.clients = {}
    this.clientSnapshotKeys = []
    this.saveSnapshotInfoThrottle()
  }

  /**
   * 设置 setLatest 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 构造实例 constructor 对应的业务能力，参数和执行顺序保持原实现。
   * @param userDataManage userDataManage 原业务参数。
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
