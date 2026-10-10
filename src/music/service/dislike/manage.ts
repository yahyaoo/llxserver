/** 不喜欢规则管理门面：协调当前数据、历史快照和设备同步游标。 @author yahyaoo */
import { type UserDataManage } from '../../../user'
import { SnapshotDataManage } from './snapshotDataManage'
import { DislikeDataManage } from './dislikeDataManage'
import { toMD5 } from '../../../utils'

/** 协调不喜欢数据管理和设备快照游标。 @author yahyaoo */
export class DislikeManage {
  /** 当前用户快照管理器。 */
  snapshotDataManage: SnapshotDataManage
  /** 当前用户不喜欢数据管理器。 */
  dislikeDataManage: DislikeDataManage

  /**
 * 装配当前用户的数据管理器、快照管理器和变更事件。
 * @param userDataManage 当前用户空间的数据与快照管理器。
 * @author yahyaoo
 */
  constructor(userDataManage: UserDataManage) {
    this.snapshotDataManage = new SnapshotDataManage(userDataManage)
    this.dislikeDataManage = new DislikeDataManage(this.snapshotDataManage)
  }

  /**
 * 将当前用户数据保存为新快照，并记录最新快照标识。
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
 * 返回当前用户数据对应的最新快照标识。
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
 * 读取设备已确认同步到的快照标识。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
  getDeviceCurrentSnapshotKey = async(clientId: string) => {
    return this.snapshotDataManage.getDeviceCurrentSnapshotKey(clientId)
  }

  /**
 * 更新设备同步游标，并保存设备到快照的对应关系。
 * @param clientId 配对客户端标识。
 * @param key 业务作用域或缓存键。
 * @author yahyaoo
 */
  updateDeviceSnapshotKey = async(clientId: string, key: string) => {
    await this.snapshotDataManage.updateDeviceSnapshotKey(clientId, key)
  }

  /**
 * 关闭指定设备的在线连接，并删除用户空间中的设备记录。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
  removeDevice = async(clientId: string) => {
    this.snapshotDataManage.removeSnapshotInfo(clientId)
  }

  /**
 * 读取当前用户的不喜欢规则，用于歌曲、歌手和专辑过滤。
 * @author yahyaoo
 */
  getDislikeRules = async() => {
    return await this.dislikeDataManage.getDislikeRules()
  }
}

