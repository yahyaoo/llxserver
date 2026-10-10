import path from 'node:path'
import crypto from 'node:crypto'
import type { MusicConfigurationPort } from '../../repository/MusicConfigurationRepository'
import type { LxConfigurationDto } from '../../model/dto/LxConfigurationDto'
import type { LxConfigurationImportVo } from '../../model/vo/LxConfigurationImportVo'
import type { UserSpace } from '../../../user'

/** 播放器导入服务，不读取管理库、管理配置或其他用户数据。 @author yahyaoo */
export class LxConfigurationImportService {
  /** @param repository 配置仓储契约。 */
  constructor(private readonly repository: MusicConfigurationPort) {}

  /** @param space 当前已鉴权的用户空间。 @param data 完整校验的导入参数。 @returns 实际覆盖结果。 */
  async import(space: UserSpace, data: LxConfigurationDto): Promise<LxConfigurationImportVo> {
    await space.listManage.listDataManage.initPromise
    const snapshots = space.listManage.snapshotDataManage
    const text = data.lists ? JSON.stringify(data.lists) : ''
    const key = crypto.createHash('md5').update(text).digest('hex')
    const originalInfo = await snapshots.getSnapshotInfo()
    const info = { ...originalInfo, latest: key, time: Date.now(), clients: {}, list: originalInfo.list.filter(item => item !== key) }
    if (originalInfo.latest && originalInfo.latest !== key && !info.list.includes(originalInfo.latest)) info.list.unshift(originalInfo.latest)
    const snapshot = data.lists ? { path: path.join(snapshots.snapshotDir, 'snapshot_' + key), key, infoPath: snapshots.snapshotInfoFilePath, info } : undefined
    // 所有 SQL 成功后才更新内存，失败时既不清空当前歌单也不留下部分配置。
    this.repository.replace(space.dataManage.userDir, data, snapshot)
    if (data.lists) {
      await space.listManage.listDataManage.restore(data.lists)
      snapshots.snapshotInfo = info
      snapshots.clientSnapshotKeys = []
    }
    const sections = Object.keys(data)
    return { success: true, sections, playlists: data.lists ? data.lists.userList.length + 2 : 0,
      songs: data.lists ? data.lists.defaultList.length + data.lists.loveList.length + data.lists.userList.reduce((count, list) => count + list.list.length, 0) : 0 }
  }
}
