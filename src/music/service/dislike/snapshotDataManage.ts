/** 不喜欢规则快照存储：读写版本数据、设备游标并按数量清理历史。 @author yahyaoo */
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
  clients: Record<string, LX.Sync.Dislike.ListInfo>
}
/** 管理用户数据快照的读取、写入、保留数量和设备游标。 @author yahyaoo */
export class SnapshotDataManage {

  userDataManage: UserDataManage
  /** 用户不喜欢规则持久化目录。 */
  dislikeDir: string
  /** 用户历史快照目录。 */
  snapshotDir: string
  /** 快照元数据文档路径。 */
  snapshotInfoFilePath: string
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
  clearOldSnapshot = async() => {
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
  updateDeviceSnapshotKey = async(clientId: string, key: string) => {
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
  getDeviceCurrentSnapshotKey = async(clientId: string) => {
    // console.log('updateDeviceSnapshotKey', key)
    const client = this.snapshotInfo.clients[clientId]
    return client?.snapshotKey
  }

  /**
 * 读取快照元数据，包含最新标识、生成时间和设备游标。
 * @author yahyaoo
 */
  getSnapshotInfo = async(): Promise<SnapshotInfo> => {
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
  getSnapshot = async(name: string) => {
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    let listData: LX.Dislike.DislikeRules
    try {
      const content = (await storageFs.promises.readFile(filePath)).toString('utf-8')
      // If it starts with { it is likely JSON, otherwise it's old string format (we don't write compatibility code as requested, but we should at least parse JSON properly)
      if (content.trim().startsWith('{')) {
        listData = JSON.parse(content)
      } else {
        // Fallback for old format if someone encounters it, though user said no compatibility needed. Let's just create an empty list.
        listData = { dislikeList: [] }
      }
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
  saveSnapshot = async(name: string, data: LX.Dislike.DislikeRules) => {
    syncLog.info('saveSnapshot', this.userDataManage.userName, name)
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    try {
      storageFs.writeFileSync(filePath, JSON.stringify(data, null, 2))
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
  removeSnapshot = async(name: string) => {
    syncLog.info('removeSnapshot', this.userDataManage.userName, name)
    const filePath = path.join(this.snapshotDir, `snapshot_${name}`)
    try {
      storageFs.unlinkSync(filePath)
    } catch (err) {
      syncLog.error(err)
    }
  }


  /**
 * 绑定用户快照目录，载入或初始化最新版本与设备游标。
 * @param userDataManage 当前用户空间的数据与快照管理器。
 * @author yahyaoo
 */
  constructor(userDataManage: UserDataManage) {
    this.userDataManage = userDataManage

    this.dislikeDir = path.join(userDataManage.userDir, File.dislikeDir)
    checkAndCreateDirSync(this.dislikeDir)

    this.snapshotDir = path.join(this.dislikeDir, File.dislikeSnapshotDir)
    checkAndCreateDirSync(this.snapshotDir)

    this.snapshotInfoFilePath = path.join(this.dislikeDir, File.dislikeSnapshotInfoJSON)
    this.snapshotInfo = storageFs.existsSync(this.snapshotInfoFilePath)
      ? JSON.parse(storageFs.readFileSync(this.snapshotInfoFilePath).toString())
      : { latest: null, time: 0, list: [], clients: {} }

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
