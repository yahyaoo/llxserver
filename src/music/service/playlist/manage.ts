/** manage 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import { type UserDataManage } from '../../../user'
import { SnapshotDataManage } from './snapshotDataManage'
import { ListDataManage } from './listDataManage'
import { toMD5 } from '../../../utils'

/**
 * ListManage 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export class ListManage {
  /**
   * snapshotDataManage 字段，沿用原业务结构与空值约定。
   */
  snapshotDataManage: SnapshotDataManage
  /**
   * listDataManage 字段，沿用原业务结构与空值约定。
   */
  listDataManage: ListDataManage

  /**
   * 构造实例 constructor 对应的业务能力，参数和执行顺序保持原实现。
   * @param userDataManage userDataManage 原业务参数。
   * @author yahyaoo
   */
  constructor(userDataManage: UserDataManage) {
    this.snapshotDataManage = new SnapshotDataManage(userDataManage)
    this.listDataManage = new ListDataManage(this.snapshotDataManage)
  }

  /**
   * 创建 createSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  createSnapshot = async () => {
    const listData = JSON.stringify(await this.getListData())
    const md5 = toMD5(listData)
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
  getCurrentListInfoKey = async () => {
    const snapshotInfo = await this.snapshotDataManage.getSnapshotInfo()
    if (snapshotInfo.latest) return snapshotInfo.latest
    // snapshotInfo.latest = toMD5(JSON.stringify(await this.getListData()))
    // this.snapshotDataManage.saveSnapshotInfo(snapshotInfo)
    return this.createSnapshot()
  }

  /**
   * 获取 getDeviceCurrentSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    return this.snapshotDataManage.getDeviceCurrentSnapshotKey(clientId)
  }

  /**
   * 更新 updateDeviceSnapshotKey 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @param key 业务作用域或缓存键。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  updateDeviceSnapshotKey = async (clientId: string, key: string) => {
    await this.snapshotDataManage.updateDeviceSnapshotKey(clientId, key)
  }

  /**
   * 移除 removeDevice 对应的业务能力，参数和执行顺序保持原实现。
   * @param clientId 配对客户端标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  removeDevice = async (clientId: string) => {
    this.snapshotDataManage.removeSnapshotInfo(clientId)
  }

  /**
   * 获取 getListData 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getListData = async () => {
    return await this.listDataManage.getListData()
  }

  /**
   * 获取 getSnapshotList 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getSnapshotList = async () => {
    return this.snapshotDataManage.getSnapshotListWithMeta()
  }

  /**
   * 获取 getSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getSnapshot = async (name: string) => {
    return this.snapshotDataManage.getSnapshot(name)
  }

  /**
   * 恢复 restoreSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  restoreSnapshot = async (name: string) => {
    const listData = await this.snapshotDataManage.getSnapshot(name)
    if (!listData) throw new Error('Snapshot not found')
    await this.listDataManage.restore(listData)

    this.snapshotDataManage.clearClients()
    this.snapshotDataManage.setLatest(name)
  }

  /**
   * 移除 removeSnapshot 对应的业务能力，参数和执行顺序保持原实现。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  removeSnapshot = async (name: string) => {
    await this.snapshotDataManage.removeSnapshot(name)
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
    await this.snapshotDataManage.saveSnapshotWithTime(name, data, time)
  }
}

