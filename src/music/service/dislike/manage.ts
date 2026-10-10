/** manage 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import { type UserDataManage } from '../../../user'
import { SnapshotDataManage } from './snapshotDataManage'
import { DislikeDataManage } from './dislikeDataManage'
import { toMD5 } from '../../../utils'

/**
 * DislikeManage 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export class DislikeManage {
  /**
   * snapshotDataManage 字段，沿用原业务结构与空值约定。
   */
  snapshotDataManage: SnapshotDataManage
  /**
   * dislikeDataManage 字段，沿用原业务结构与空值约定。
   */
  dislikeDataManage: DislikeDataManage

  /**
   * 构造实例 constructor 对应的业务能力，参数和执行顺序保持原实现。
   * @param userDataManage userDataManage 原业务参数。
   * @author yahyaoo
   */
  constructor(userDataManage: UserDataManage) {
    this.snapshotDataManage = new SnapshotDataManage(userDataManage)
    this.dislikeDataManage = new DislikeDataManage(this.snapshotDataManage)
  }

  /**
   * 创建 createSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  createSnapshot = async() => {
    const listData = await this.getDislikeRules()
    const md5 = toMD5(JSON.stringify(listData))
    const snapshotInfo = await this.snapshotDataManage.getSnapshotInfo()
    console.log(md5, snapshotInfo.latest)
    if (snapshotInfo.latest == md5) return md5
    if (snapshotInfo.list.includes(md5)) {
      snapshotInfo.list.splice(snapshotInfo.list.indexOf(md5), 1)
    } else await this.snapshotDataManage.saveSnapshot(md5, listData)
    if (snapshotInfo.latest) snapshotInfo.list.unshift(snapshotInfo.latest)
    snapshotInfo.latest = md5
    snapshotInfo.time = Date.now()
    this.snapshotDataManage.saveSnapshotInfo(snapshotInfo)
    return md5
  }

  /**
   * 获取 getCurrentListInfoKey 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getCurrentListInfoKey = async() => {
    const snapshotInfo = await this.snapshotDataManage.getSnapshotInfo()
    if (snapshotInfo.latest) return snapshotInfo.latest
    // snapshotInfo.latest = toMD5((await this.getDislikeRules()).trim())
    // this.snapshotDataManage.saveSnapshotInfo(snapshotInfo)
    return this.createSnapshot()
  }

  /**
   * 获取 getDeviceCurrentSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDeviceCurrentSnapshotKey = async(clientId: string) => {
    return this.snapshotDataManage.getDeviceCurrentSnapshotKey(clientId)
  }

  /**
   * 更新 updateDeviceSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @param key 业务作用域或缓存键。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  updateDeviceSnapshotKey = async(clientId: string, key: string) => {
    await this.snapshotDataManage.updateDeviceSnapshotKey(clientId, key)
  }

  /**
   * 移除 removeDevice 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  removeDevice = async(clientId: string) => {
    this.snapshotDataManage.removeSnapshotInfo(clientId)
  }

  /**
   * 获取 getDislikeRules 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDislikeRules = async() => {
    return await this.dislikeDataManage.getDislikeRules()
  }
}

