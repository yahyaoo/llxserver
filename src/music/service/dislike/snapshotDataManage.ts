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
  clients: Record<string, LX.Sync.Dislike.ListInfo>
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
   * dislikeDir 字段，沿用原业务结构与空值约定。
   */
  dislikeDir: string
  /**
   * snapshotDir 字段，沿用原业务结构与空值约定。
   */
  snapshotDir: string
  /**
   * snapshotInfoFilePath 字段，沿用原业务结构与空值约定。
   */
  snapshotInfoFilePath: string
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
   * 更新 updateDeviceSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @param key 业务作用域或缓存键。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 获取 getDeviceCurrentSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDeviceCurrentSnapshotKey = async(clientId: string) => {
    // console.log('updateDeviceSnapshotKey', key)
    const client = this.snapshotInfo.clients[clientId]
    return client?.snapshotKey
  }

  /**
   * 获取 getSnapshotInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getSnapshotInfo = async(): Promise<SnapshotInfo> => {
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
   * 保存 saveSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @param data 原业务数据，保留扩展字段。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 移除 removeSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 构造实例 constructor 对应的业务能力，参数和执行顺序保持原实现。
   * @param userDataManage userDataManage 原业务参数。
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
