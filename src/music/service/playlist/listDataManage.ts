/** listDataManage 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import { arrPush, arrPushByPosition, arrUnshift } from '../../../utils/common'
import { LIST_IDS } from '../../../constants'
import { type SnapshotDataManage } from './snapshotDataManage'

/**
 * ListDataManage 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export class ListDataManage {
  /**
   * snapshotDataManage 字段，沿用原业务结构与空值约定。
   */
  snapshotDataManage: SnapshotDataManage
  /**
   * userLists 字段，沿用原业务结构与空值约定。
   */
  userLists: LX.List.UserListInfo[] = []
  /**
   * allMusicList 字段，沿用原业务结构与空值约定。
   */
  allMusicList = new Map<string, LX.Music.MusicInfo[]>()
  /**
   * initPromise 字段，沿用原业务结构与空值约定。
   */
  initPromise: Promise<void>

  /**
   * 构造实例 constructor 对应的业务能力，参数和执行顺序保持原实现。
   * @param snapshotDataManage snapshotDataManage 原业务参数。
   * @author yahyaoo
   */
  constructor(snapshotDataManage: SnapshotDataManage) {
    this.snapshotDataManage = snapshotDataManage

    let listData: LX.Sync.List.ListData | null
    this.initPromise = this.snapshotDataManage.getSnapshotInfo().then(async (snapshotInfo) => {
      if (snapshotInfo.latest) listData = await this.snapshotDataManage.getSnapshot(snapshotInfo.latest)
      if (!listData) listData = { defaultList: [], loveList: [], userList: [] }
      this.allMusicList.set(LIST_IDS.DEFAULT, listData.defaultList)
      this.allMusicList.set(LIST_IDS.LOVE, listData.loveList)
      this.userLists.push(...listData.userList.map(({ list, ...l }) => {
        this.allMusicList.set(l.id, list)
        return l
      }))
    })
  }
  /**
   * 恢复 restore 对应的业务能力，参数和执行顺序保持原实现。
   * @param listData listData 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  restore = async (listData: LX.Sync.List.ListData) => {
    this.allMusicList.clear()
    this.userLists = []

    this.allMusicList.set(LIST_IDS.DEFAULT, listData.defaultList)
    this.allMusicList.set(LIST_IDS.LOVE, listData.loveList)
    this.userLists.push(...listData.userList.map(({ list, ...l }) => {
      this.allMusicList.set(l.id, list)
      return l
    }))
  }
  /**
   * 获取 getListData 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 设置 setUserLists 对应的业务能力，参数和执行顺序保持原实现。
   * @param lists lists 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly setUserLists = (lists: LX.List.UserListInfo[]) => {
    this.userLists.splice(0, this.userLists.length, ...lists)
    return this.userLists
  }

  /**
   * 设置 setMusicList 对应的业务能力，参数和执行顺序保持原实现。
   * @param listId listId 原业务参数。
   * @param musicList musicList 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly setMusicList = (listId: string, musicList: LX.Music.MusicInfo[]): LX.Music.MusicInfo[] => {
    this.allMusicList.set(listId, musicList)
    return musicList
  }

  /**
   * 移除 removeMusicList 对应的业务能力，参数和执行顺序保持原实现。
   * @param id 原业务标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly removeMusicList = (id: string) => {
    this.allMusicList.delete(id)
  }

  /**
   * 创建 createUserList 对应的业务能力，参数和执行顺序保持原实现。
   * @param {
    name,
    id,
    source,
    sourceListId,
    locationUpdateTime,
  } {
    name,
    id,
    source,
    sourceListId,
    locationUpdateTime,
  } 原业务参数。
   * @param position 原列表插入位置。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly createUserList = ({
    name,
    id,
    source,
    sourceListId,
    locationUpdateTime,
  }: LX.List.UserListInfo, position: number) => {
    if (position < 0 || position >= this.userLists.length) {
      this.userLists.push({
        name,
        id,
        source,
        sourceListId,
        locationUpdateTime,
      })
    } else {
      this.userLists.splice(position, 0, {
        name,
        id,
        source,
        sourceListId,
        locationUpdateTime,
      })
    }
  }

  /**
   * 更新 updateList 对应的业务能力，参数和执行顺序保持原实现。
   * @param {
    name,
    id,
    source,
    sourceListId,
    // meta,
    locationUpdateTime,
  } {
    name,
    id,
    source,
    sourceListId,
    // meta,
    locationUpdateTime,
  } 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly updateList = ({
    name,
    id,
    source,
    sourceListId,
    // meta,
    locationUpdateTime,
  }: LX.List.UserListInfo & { /**
 * meta 字段，沿用原业务结构与空值约定。
 */
meta?: { /**
 * id 字段，沿用原业务结构与空值约定。
 */
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
        break
    }
  }

  /**
   * 移除 removeUserList 对应的业务能力，参数和执行顺序保持原实现。
   * @param id 原业务标识。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly removeUserList = (id: string) => {
    const index = this.userLists.findIndex(l => l.id == id)
    if (index < 0) return
    this.userLists.splice(index, 1)
    // removeMusicList(id)
  }

  /**
   * 处理 overwriteUserList 对应的业务能力，参数和执行顺序保持原实现。
   * @param lists lists 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  private readonly overwriteUserList = (lists: LX.List.UserListInfo[]) => {
    this.userLists.splice(0, this.userLists.length, ...lists)
  }


  // const sendMyListUpdateEvent = (ids: string[]) => {
  //   window.app_event.myListUpdate(ids)
  // }


  /**
   * 列举 listDataOverwrite 对应的业务能力，参数和执行顺序保持原实现。
   * @param { defaultList, loveList, userList, tempList } { defaultList, loveList, userList, tempList } 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 处理 userListCreate 对应的业务能力，参数和执行顺序保持原实现。
   * @param { name, id, source, sourceListId, position, locationUpdateTime } { name, id, source, sourceListId, position, locationUpdateTime } 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  userListCreate = async ({ name, id, source, sourceListId, position, locationUpdateTime }: {
    /**
     * name 字段，沿用原业务结构与空值约定。
     */
    name: string
    /**
     * id 字段，沿用原业务结构与空值约定。
     */
    id: string
    /**
     * source 字段，沿用原业务结构与空值约定。
     */
    source?: LX.OnlineSource
    /**
     * sourceListId 字段，沿用原业务结构与空值约定。
     */
    sourceListId?: string
    /**
     * position 字段，沿用原业务结构与空值约定。
     */
    position: number
    /**
     * locationUpdateTime 字段，沿用原业务结构与空值约定。
     */
    locationUpdateTime: number | null
  }) => {
    if (this.userLists.some(item => item.id == id)) return
    const newList: LX.List.UserListInfo = {
      name,
      id,
      source,
      sourceListId,
      locationUpdateTime,
    }
    this.createUserList(newList, position)
  }

  /**
   * 处理 userListsRemove 对应的业务能力，参数和执行顺序保持原实现。
   * @param ids ids 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 处理 userListsUpdate 对应的业务能力，参数和执行顺序保持原实现。
   * @param listInfos listInfos 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  userListsUpdate = async (listInfos: LX.List.UserListInfo[]) => {
    for (const info of listInfos) {
      this.updateList(info)
    }
  }

  /**
   * 处理 userListsUpdatePosition 对应的业务能力，参数和执行顺序保持原实现。
   * @param position 原列表插入位置。
   * @param ids ids 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
    if (!listId || !this.allMusicList.has(listId)) return []
    return this.allMusicList.get(listId) as LX.Music.MusicInfo[]
  }

  /**
   * 列举 listMusicOverwrite 对应的业务能力，参数和执行顺序保持原实现。
   * @param listId listId 原业务参数。
   * @param musicInfos musicInfos 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  listMusicOverwrite = async (listId: string, musicInfos: LX.Music.MusicInfo[]): Promise<string[]> => {
    this.setMusicList(listId, musicInfos)
    return [listId]
  }

  /**
   * 列举 listMusicAdd 对应的业务能力，参数和执行顺序保持原实现。
   * @param id 原业务标识。
   * @param musicInfos musicInfos 原业务参数。
   * @param addMusicLocationType addMusicLocationType 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 列举 listMusicRemove 对应的业务能力，参数和执行顺序保持原实现。
   * @param listId listId 原业务参数。
   * @param ids ids 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 列举 listMusicMove 对应的业务能力，参数和执行顺序保持原实现。
   * @param fromId fromId 原业务参数。
   * @param toId toId 原业务参数。
   * @param musicInfos musicInfos 原业务参数。
   * @param addMusicLocationType addMusicLocationType 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  listMusicMove = async (fromId: string, toId: string, musicInfos: LX.Music.MusicInfo[], addMusicLocationType: LX.AddMusicLocationType): Promise<string[]> => {
    return [
      ...await this.listMusicRemove(fromId, musicInfos.map(musicInfo => musicInfo.id)),
      ...await this.listMusicAdd(toId, musicInfos, addMusicLocationType),
    ]
  }

  /**
   * 列举 listMusicUpdateInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @param musicInfos musicInfos 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 列举 listMusicUpdatePosition 对应的业务能力，参数和执行顺序保持原实现。
   * @param listId listId 原业务参数。
   * @param position 原列表插入位置。
   * @param ids ids 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 列举 listMusicClear 对应的业务能力，参数和执行顺序保持原实现。
   * @param ids ids 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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

