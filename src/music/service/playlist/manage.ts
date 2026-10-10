/** 歌单管理门面：协调当前数据、历史快照和设备同步游标。 @author yahyaoo */
import { type UserDataManage } from '../../../user'
import { SnapshotDataManage } from './snapshotDataManage'
import { ListDataManage } from './listDataManage'
import { toMD5 } from '../../../utils'

/** 协调用户歌单数据、快照生成和设备同步游标。 @author yahyaoo */
export class ListManage {
  /** 当前用户快照管理器。 */
  snapshotDataManage: SnapshotDataManage
  /** 当前用户歌单数据管理器。 */
  listDataManage: ListDataManage

  /**
 * 装配当前用户的数据管理器、快照管理器和变更事件。
 * @param userDataManage 当前用户空间的数据与快照管理器。
 * @author yahyaoo
 */
  constructor(userDataManage: UserDataManage) {
    this.snapshotDataManage = new SnapshotDataManage(userDataManage)
    this.listDataManage = new ListDataManage(this.snapshotDataManage)
  }

  /**
 * 将当前用户数据保存为新快照，并记录最新快照标识。
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
 * 返回当前用户数据对应的最新快照标识。
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
 * 读取设备已确认同步到的快照标识。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    return this.snapshotDataManage.getDeviceCurrentSnapshotKey(clientId)
  }

  /**
 * 更新设备同步游标，并保存设备到快照的对应关系。
 * @param clientId 配对客户端标识。
 * @param key 业务作用域或缓存键。
 * @author yahyaoo
 */
  updateDeviceSnapshotKey = async (clientId: string, key: string) => {
    await this.snapshotDataManage.updateDeviceSnapshotKey(clientId, key)
  }

  /**
 * 关闭指定设备的在线连接，并删除用户空间中的设备记录。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
  removeDevice = async (clientId: string) => {
    this.snapshotDataManage.removeSnapshotInfo(clientId)
  }

  /**
 * 读取当前用户的默认列表、收藏列表和自定义歌单数据。
 * @author yahyaoo
 */
  getListData = async () => {
    return await this.listDataManage.getListData()
  }

  /**
 * 列出用户可用于恢复的数据快照。
 * @author yahyaoo
 */
  getSnapshotList = async () => {
    return this.snapshotDataManage.getSnapshotListWithMeta()
  }

  /**
 * 读取指定快照中的完整用户数据。
 * @param name 对象名称或归档内相对名称。
 * @author yahyaoo
 */
  getSnapshot = async (name: string) => {
    return this.snapshotDataManage.getSnapshot(name)
  }

  /**
 * 载入选定快照作为当前数据，并发出同步通知。
 * @param name 对象名称或归档内相对名称。
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
 * 删除选定快照数据并维护快照元数据。
 * @param name 对象名称或归档内相对名称。
 * @author yahyaoo
 */
  removeSnapshot = async (name: string) => {
    await this.snapshotDataManage.removeSnapshot(name)
  }

  /**
 * 按指定历史时间保存快照，用于导入和恢复历史版本。
 * @param name 对象名称或归档内相对名称。
 * @param data 需要保存或转换的数据。
 * @param time 快照或记录时间，单位毫秒。
 * @author yahyaoo
 */
  saveSnapshotWithTime = async (name: string, data: string, time: number) => {
    await this.snapshotDataManage.saveSnapshotWithTime(name, data, time)
  }
}

