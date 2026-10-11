/** 歌单数据管理：保存列表定义、歌曲映射以及列表和歌曲排序。 @author yahyaoo */
import { arrPush, arrPushByPosition, arrUnshift } from '../../../utils/common'
import { LIST_IDS } from '../../../constants'
import { type SnapshotDataManage } from './snapshotDataManage'
import { FavoriteRepository } from '../../repository/FavoriteRepository'
import { repositories } from '../../../application/persistence/storage'
import path from 'node:path'

/** 维护歌单定义和歌曲映射，实现歌单及歌曲增删改与排序。 @author yahyaoo */
export class ListDataManage {
  /** 当前用户快照管理器。 */
  snapshotDataManage: SnapshotDataManage

  userLists: LX.List.UserListInfo[] = []

  allMusicList = new Map<string, LX.Music.MusicInfo[]>()

  initPromise: Promise<void>
  /** 独立喜爱存储；loveList 仅作为洛雪同步协议的兼容字段。 */
  private readonly favorites: FavoriteRepository
  /** 用户封面文档作用域，不依赖数据库的物理位置。 */
  private readonly coverKey: string

  /**
 * 绑定用户歌单目录并初始化列表与歌曲映射。
 * @param snapshotDataManage 当前用户的快照管理器。
 * @author yahyaoo
 */
  constructor(snapshotDataManage: SnapshotDataManage) {
    this.snapshotDataManage = snapshotDataManage
    this.favorites = new FavoriteRepository(repositories().music, snapshotDataManage.userDataManage.userDir)
    this.coverKey = path.join(snapshotDataManage.userDataManage.userDir, 'playlist-covers.json')

    let listData: LX.Sync.List.ListData | null
    this.initPromise = this.snapshotDataManage.getSnapshotInfo().then(async (snapshotInfo) => {
      if (snapshotInfo.latest) listData = await this.snapshotDataManage.getSnapshot(snapshotInfo.latest)
      if (!listData) listData = { defaultList: [], loveList: [], userList: [] }
      const covers = (repositories().music.read('client_playlist_cover', this.coverKey)?.value || {}) as Record<string, string>
      for (const list of listData.userList) if (list.cover === undefined && covers[list.id] !== undefined) list.cover = covers[list.id]
      this.allMusicList.set(LIST_IDS.DEFAULT, listData.defaultList)
      this.allMusicList.set(LIST_IDS.LOVE, this.favorites.initialize(listData.loveList || []))
      this.userLists.push(...listData.userList.map(({ list, ...l }) => {
        this.allMusicList.set(l.id, list)
        return l
      }))
      this.persistCovers()
    })
  }
  /**
 * 从已保存快照恢复用户歌单与歌曲映射。
 * @param listData 默认、收藏及自定义歌单数据。
 * @author yahyaoo
 */
  restore = async (listData: LX.Sync.List.ListData, preserveFavorites = false) => {
    await this.initPromise
    // 旧同步客户端没有封面字段时保留自定义图片，显式空字符串仍表示移除。
    if (preserveFavorites) for (const list of listData.userList) {
      if (list.cover === undefined) list.cover = this.userLists.find(item => item.id === list.id)?.cover
    }
    // 普通歌单保存不能用客户端旧快照覆盖独立喜爱；同步和显式恢复仍支持完整数据。
    const favorites = preserveFavorites ? (this.allMusicList.get(LIST_IDS.LOVE) ?? []) : listData.loveList
    this.allMusicList.clear()
    this.userLists = []

    this.allMusicList.set(LIST_IDS.DEFAULT, listData.defaultList)
    this.allMusicList.set(LIST_IDS.LOVE, favorites)
    this.userLists.push(...listData.userList.map(({ list, ...l }) => {
      this.allMusicList.set(l.id, list)
      return l
    }))
    this.persistFavorites()
    this.persistCovers()
  }

  /** 原子替换当前歌单封面映射；删除歌单同时移除独立封面记录。 */
  persistCovers = () => repositories().music.write('client_playlist_cover', this.coverKey, JSON.stringify(
    Object.fromEntries(this.userLists.filter(list => list.cover !== undefined).map(list => [list.id, list.cover]))
  ))

  /** 在同步快照提交前持久化喜爱，覆盖洛雪与 Subsonic 的现有歌曲增删及排序入口。 @author jingyh */
  persistFavorites = () => this.favorites.save(this.allMusicList.get(LIST_IDS.LOVE) ?? [])
  /**
 * 读取当前用户的默认列表、收藏列表和自定义歌单数据。
 * @author yahyaoo
 */
  getListData = async (): Promise<LX.Sync.List.ListData> => {
    await this.initPromise
    return {
      defaultList: this.allMusicList.get(LIST_IDS.DEFAULT) ?? [],
      loveList: this.allMusicList.get(LIST_IDS.LOVE) ?? [],
      userList: this.userLists.map(l => ({ ...l, list: this.allMusicList.get(l.id) ?? [] })),
    }
  }


  /**
 * 替换自定义歌单定义，并维护歌单到歌曲列表的映射。
 * @param lists 歌单定义集合。
 * @author yahyaoo
 */
  private readonly setUserLists = (lists: LX.List.UserListInfo[]) => {
    this.userLists.splice(0, this.userLists.length, ...lists)
    return this.userLists
  }

  /**
 * 按歌单标识保存该歌单的歌曲数组。
 * @param listId 目标歌单标识。
 * @param musicList 歌单歌曲数组。
 * @author yahyaoo
 */
  private readonly setMusicList = (listId: string, musicList: LX.Music.MusicInfo[]): LX.Music.MusicInfo[] => {
    this.allMusicList.set(listId, musicList)
    return musicList
  }

  /**
 * 删除歌单对应的歌曲数组记录。
 * @param id 当前业务对象标识。
 * @author yahyaoo
 */
  private readonly removeMusicList = (id: string) => {
    this.allMusicList.delete(id)
  }

  /**
 * 创建自定义歌单并初始化其歌曲记录。
 * @param position 原列表插入位置。
 * @author yahyaoo
 */
  private readonly createUserList = ({
    name,
    id,
    source,
    sourceListId,
    locationUpdateTime,
    cover,
  }: LX.List.UserListInfo, position: number) => {
    if (position < 0 || position >= this.userLists.length) {
      this.userLists.push({
        name,
        id,
        source,
        sourceListId,
        locationUpdateTime,
        cover,
      })
    } else {
      this.userLists.splice(position, 0, {
        name,
        id,
        source,
        sourceListId,
        locationUpdateTime,
        cover,
      })
    }
  }

  /**
 * 更新指定歌单的名称及其他定义信息。
 * @author yahyaoo
 */
  private readonly updateList = ({
    name,
    id,
    source,
    sourceListId,
    // meta,
    locationUpdateTime,
    cover,
  }: LX.List.UserListInfo & {
meta?: { /** 条目唯一标识。 */
id?: string } }) => {
    let targetList
    switch (id) {
      case LIST_IDS.DEFAULT:
      case LIST_IDS.LOVE:
        break
      case LIST_IDS.TEMP:
      //   tempList.meta = meta ?? {}
      // break
      default:
        targetList = this.userLists.find(l => l.id == id)
        if (!targetList) return
        targetList.name = name
        targetList.source = source
        targetList.sourceListId = sourceListId
        targetList.locationUpdateTime = locationUpdateTime
        if (cover !== undefined) targetList.cover = cover
        break
    }
  }

  /**
 * 删除自定义歌单及其歌曲数据。
 * @param id 当前业务对象标识。
 * @author yahyaoo
 */
  private readonly removeUserList = (id: string) => {
    const index = this.userLists.findIndex(l => l.id == id)
    if (index < 0) return
    this.userLists.splice(index, 1)
    // removeMusicList(id)
  }

  /**
 * 使用新歌单定义和歌曲内容覆盖指定自定义歌单。
 * @param lists 歌单定义集合。
 * @author yahyaoo
 */
  private readonly overwriteUserList = (lists: LX.List.UserListInfo[]) => {
    this.userLists.splice(0, this.userLists.length, ...lists)
  }


  // const sendMyListUpdateEvent = (ids: string[]) => {
  //   window.app_event.myListUpdate(ids)
  // }


  /**
 * 覆盖全部歌单定义与歌曲内容，重建当前歌单映射。
 * @author yahyaoo
 */
  listDataOverwrite = async ({ defaultList, loveList, userList, tempList }: MakeOptional<LX.List.ListDataFull, 'tempList'>): Promise<string[]> => {
    const updatedListIds: string[] = []
    const newUserIds: string[] = []
    const newUserListInfos = userList.map(({ list, ...listInfo }) => {
      if (this.allMusicList.has(listInfo.id)) updatedListIds.push(listInfo.id)
      newUserIds.push(listInfo.id)
      this.setMusicList(listInfo.id, list)
      return listInfo
    })
    for (const list of this.userLists) {
      if (!this.allMusicList.has(list.id) || newUserIds.includes(list.id)) continue
      this.removeMusicList(list.id)
      updatedListIds.push(list.id)
    }
    this.overwriteUserList(newUserListInfos)

    if (this.allMusicList.has(LIST_IDS.DEFAULT)) updatedListIds.push(LIST_IDS.DEFAULT)
    this.setMusicList(LIST_IDS.DEFAULT, defaultList)
    this.setMusicList(LIST_IDS.LOVE, loveList)
    updatedListIds.push(LIST_IDS.LOVE)

    if (tempList && this.allMusicList.has(LIST_IDS.TEMP)) {
      this.setMusicList(LIST_IDS.TEMP, tempList)
      updatedListIds.push(LIST_IDS.TEMP)
    }
    const newIds = [LIST_IDS.DEFAULT, LIST_IDS.LOVE, ...userList.map(l => l.id)]
    if (tempList) newIds.push(LIST_IDS.TEMP)
    // void overwriteListPosition(newIds)
    // void overwriteListUpdateInfo(newIds)
    return updatedListIds
  }

  /**
 * 批量创建自定义歌单并通知歌单变更。
 * @author yahyaoo
 */
  userListCreate = async ({ name, id, source, sourceListId, position, locationUpdateTime, cover }: {
    /** 自定义封面内容或图片地址。 */
    cover?: string
    /** 记录显示名称。 */
    name: string
    /** 业务记录标识。 */
    id: string
    /** 歌曲或详情所属的音乐平台。 */
    source?: LX.OnlineSource
    /** 远端歌单标识。 */
    sourceListId?: string

    position: number

    locationUpdateTime: number | null
  }) => {
    if (this.userLists.some(item => item.id == id)) return
    const newList: LX.List.UserListInfo = {
      cover,
      name,
      id,
      source,
      sourceListId,
      locationUpdateTime,
    }
    this.createUserList(newList, position)
  }

  /**
 * 批量删除指定自定义歌单及关联歌曲记录。
 * @param ids 待处理标识集合。
 * @author yahyaoo
 */
  userListsRemove = async (ids: string[]) => {
    const changedIds = []
    for (const id of ids) {
      this.removeUserList(id)
      // removeListPosition(id)
      // removeListUpdateInfo(id)
      if (!this.allMusicList.has(id)) continue
      this.removeMusicList(id)
      changedIds.push(id)
    }

    return changedIds
  }

  /**
 * 批量更新自定义歌单定义并通知变更。
 * @param listInfos 歌单定义与更新字段集合。
 * @author yahyaoo
 */
  userListsUpdate = async (listInfos: LX.List.UserListInfo[]) => {
    for (const info of listInfos) {
      this.updateList(info)
    }
  }

  /**
 * 按客户端给出的顺序调整自定义歌单位置。
 * @param position 原列表插入位置。
 * @param ids 待处理标识集合。
 * @author yahyaoo
 */
  userListsUpdatePosition = async (position: number, ids: string[]) => {
    const newUserLists = [...this.userLists]

    // console.log(position, ids)

    const updateLists: LX.List.UserListInfo[] = []

    // const targetItem = list[position]
    const map = new Map<string, LX.List.UserListInfo>()
    for (const item of newUserLists) map.set(item.id, item)
    for (const id of ids) {
      const listInfo = map.get(id) as LX.List.UserListInfo
      listInfo.locationUpdateTime = Date.now()
      updateLists.push(listInfo)
      map.delete(id)
    }
    newUserLists.splice(0, newUserLists.length, ...newUserLists.filter(mInfo => map.has(mInfo.id)))
    newUserLists.splice(Math.min(position, newUserLists.length), 0, ...updateLists)

    this.setUserLists(newUserLists)
  }


  /**
   * 获取列表内的歌曲
   * @param listId
   */
  getListMusics = async (listId: string): Promise<LX.Music.MusicInfo[]> => {
    await this.initPromise
    if (!listId || !this.allMusicList.has(listId)) return []
    return this.allMusicList.get(listId) as LX.Music.MusicInfo[]
  }

  /**
 * 覆盖指定歌单的全部歌曲。
 * @param listId 目标歌单标识。
 * @param musicInfos 待处理歌曲信息集合。
 * @author yahyaoo
 */
  listMusicOverwrite = async (listId: string, musicInfos: LX.Music.MusicInfo[]): Promise<string[]> => {
    this.setMusicList(listId, musicInfos)
    return [listId]
  }

  /**
 * 向歌单添加歌曲，按指定顶部或底部位置写入。
 * @param id 当前业务对象标识。
 * @param musicInfos 待处理歌曲信息集合。
 * @param addMusicLocationType 歌曲添加位置，top 表示顶部，bottom 表示底部。
 * @author yahyaoo
 */
  listMusicAdd = async (id: string, musicInfos: LX.Music.MusicInfo[], addMusicLocationType: LX.AddMusicLocationType): Promise<string[]> => {
    const targetList = await this.getListMusics(id)

    const listSet = new Set<string>()
    for (const item of targetList) listSet.add(item.id)
    musicInfos = musicInfos.filter(item => {
      if (listSet.has(item.id)) return false
      listSet.add(item.id)
      return true
    })
    switch (addMusicLocationType) {
      case 'top':
        arrUnshift(targetList, musicInfos)
        break
      case 'bottom':
      default:
        arrPush(targetList, musicInfos)
        break
    }

    this.setMusicList(id, targetList)

    return [id]
  }

  /**
 * 从歌单中移除选定歌曲 ID 对应的条目。
 * @param listId 目标歌单标识。
 * @param ids 待处理标识集合。
 * @author yahyaoo
 */
  listMusicRemove = async (listId: string, ids: string[]): Promise<string[]> => {
    let targetList = await this.getListMusics(listId)

    const listSet = new Set<string>()
    for (const item of targetList) listSet.add(item.id)
    for (const id of ids) listSet.delete(id)
    const newList = targetList.filter(mInfo => listSet.has(mInfo.id))
    targetList.splice(0, targetList.length)
    arrPush(targetList, newList)

    return [listId]
  }

  /**
 * 在两个歌单之间移动歌曲，维护源和目标歌单数据。
 * @param fromId 来源歌单标识。
 * @param toId 目标歌单标识。
 * @param musicInfos 待处理歌曲信息集合。
 * @param addMusicLocationType 歌曲添加位置，top 表示顶部，bottom 表示底部。
 * @author yahyaoo
 */
  listMusicMove = async (fromId: string, toId: string, musicInfos: LX.Music.MusicInfo[], addMusicLocationType: LX.AddMusicLocationType): Promise<string[]> => {
    return [
      ...await this.listMusicRemove(fromId, musicInfos.map(musicInfo => musicInfo.id)),
      ...await this.listMusicAdd(toId, musicInfos, addMusicLocationType),
    ]
  }

  /**
 * 更新歌单中指定歌曲的元信息。
 * @param musicInfos 待处理歌曲信息集合。
 * @author yahyaoo
 */
  listMusicUpdateInfo = async (musicInfos: LX.List.ListActionMusicUpdate): Promise<string[]> => {
    const updateListIds = new Set<string>()
    for (const { id, musicInfo } of musicInfos) {
      const targetList = await this.getListMusics(id)
      if (!targetList.length) continue
      const index = targetList.findIndex(l => l.id == musicInfo.id)
      if (index < 0) continue
      const info: LX.Music.MusicInfo = { ...targetList[index] }
      // console.log(musicInfo)
      Object.assign(info, {
        name: musicInfo.name,
        singer: musicInfo.singer,
        source: musicInfo.source,
        interval: musicInfo.interval,
        meta: musicInfo.meta,
      })
      targetList.splice(index, 1, info)
      updateListIds.add(id)
    }
    return Array.from(updateListIds)
  }


  /**
 * 调整歌单中歌曲的排列顺序。
 * @param listId 目标歌单标识。
 * @param position 原列表插入位置。
 * @param ids 待处理标识集合。
 * @author yahyaoo
 */
  listMusicUpdatePosition = async (listId: string, position: number, ids: string[]): Promise<string[]> => {
    let targetList = await this.getListMusics(listId)

    // const infos = Array(ids.length)
    // for (let i = targetList.length; i--;) {
    //   const item = targetList[i]
    //   const index = ids.indexOf(item.id)
    //   if (index < 0) continue
    //   infos.splice(index, 1, targetList.splice(i, 1)[0])
    // }
    // targetList.splice(Math.min(position, targetList.length - 1), 0, ...infos)

    // console.time('ts')

    // const list = createSortedList(targetList, position, ids)
    const infos: LX.Music.MusicInfo[] = []
    const map = new Map<string, LX.Music.MusicInfo>()
    for (const item of targetList) map.set(item.id, item)
    for (const id of ids) {
      infos.push(map.get(id) as LX.Music.MusicInfo)
      map.delete(id)
    }
    const list = targetList.filter(mInfo => map.has(mInfo.id))
    arrPushByPosition(list, infos, Math.min(position, list.length))

    targetList.splice(0, targetList.length)
    arrPush(targetList, list)

    // console.timeEnd('ts')
    return [listId]
  }


  /**
 * 清空指定歌单的歌曲内容。
 * @param ids 待处理标识集合。
 * @author yahyaoo
 */
  listMusicClear = async (ids: string[]): Promise<string[]> => {
    const changedIds: string[] = []
    for (const id of ids) {
      const list = await this.getListMusics(id)
      if (!list.length) continue
      this.setMusicList(id, [])
      changedIds.push(id)
    }
    return changedIds
  }
}

