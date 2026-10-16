import path from 'node:path'
import crypto from 'node:crypto'
import type { MusicConfigurationPort } from '../../repository/MusicConfigurationRepository'
import type { LxConfigurationDto } from '../../model/dto/LxConfigurationDto'
import type { LxConfigurationImportVo } from '../../model/vo/LxConfigurationImportVo'
import type { UserSpace } from '../../../user'
import type { ImportedPlaylist } from './PlaylistImportParser'
import { songIdentity } from '../library/SongIdentity'

/** 同一用户的追加导入串行执行，跨请求服务实例共享队列。 */
const playlistImports = new WeakMap<UserSpace, Promise<void>>()

/** 播放器导入服务，不读取管理库、管理配置或其他用户数据。 @author yahyaoo */
export class LxConfigurationImportService {
  /** @param repository 配置仓储契约。 */
  constructor(private readonly repository: MusicConfigurationPort) {}

  /**
   * 追加已校验歌单，并复用配置导入事务保存完整快照。
   * @param space 已鉴权的目标用户空间。
   * @param playlists 待追加的歌单，歌曲和扩展字段保持原样。
   * @returns 本次导入数量及写库后的完整列表。
   * @throws Error 写库失败时保留原内存数据和同步游标。
   * @author jingyh
   */
  async importPlaylists(space: UserSpace, playlists: ImportedPlaylist[]) {
    const previous = playlistImports.get(space) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const current = await space.listManage.getListData()
      // 每次导入重新生成内部 ID，避免覆盖内置列表、同名歌单或重复导入。
      const appended = playlists.map(item => ({ ...item, id: 'import_' + crypto.randomUUID(), list: songIdentity().aggregate(item.list) }))
      const lists = { ...current, userList: [...current.userList, ...appended] }
      await this.import(space, { lists })
      return { success: true, playlists: appended.length, songs: appended.reduce((count, item) => count + item.list.length, 0), lists }
    })
    const pending = operation.then(() => {}, () => {})
    playlistImports.set(space, pending)
    void pending.then(() => { if (playlistImports.get(space) === pending) playlistImports.delete(space) })
    return operation
  }

  /** @param space 当前已鉴权的用户空间。 @param data 完整校验的导入参数。 @returns 实际覆盖结果。 */
  async import(space: UserSpace, data: LxConfigurationDto): Promise<LxConfigurationImportVo> {
    if (data.lists) data = { ...data, lists: { ...data.lists, defaultList: songIdentity().aggregate(data.lists.defaultList), loveList: songIdentity().aggregate(data.lists.loveList), userList: data.lists.userList.map(list => ({ ...list, list: songIdentity().aggregate(list.list) })) } };
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
