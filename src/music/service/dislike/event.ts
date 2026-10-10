/** event 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import { getUserSpace } from '../../../user'
import { EventEmitter } from 'events'
// import {
//   userDislikeCreate,
//   userDislikesUpdate,
//   userDislikesRemove,
//   userDislikesUpdatePosition,
//   dislikeDataOverwrite,
//   dislikeMusicOverwrite,
//   dislikeMusicAdd,
//   dislikeMusicMove,
//   dislikeMusicRemove,
//   dislikeMusicUpdateInfo,
//   dislikeMusicUpdatePosition,
//   dislikeMusicClear,
// } from '@/dislikeManage/action'


const dislikeUpdated = () => {
  // return createSnapshot()
}
/**
 * 检查 checkUpdateDislike 对应的业务能力，参数和执行顺序保持原实现。
 * @param changedIds changedIds 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const checkUpdateDislike = async(changedIds: string[]) => {
  // if (!changedIds.length) return
  // await saveDislikeMusics(changedIds.map(id => ({ id, musics: allMusicDislike.get(id) as LX.Dislike.DislikeMusics })))
  // global.app_event.myDislikeMusicUpdate(changedIds)
}


/**
 * DislikeEvent 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export class DislikeEvent extends EventEmitter {
  /**
   * 处理 dislike_changed 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  dislike_changed() {
    this.emit('dislike_changed')
  }

  /**
   * 覆盖整个列表数据
   * @param dislikeData 列表数据
   * @param isRemote 是否属于远程操作
   */
  async dislike_data_overwrite(userName: string, dislikeData: LX.Dislike.DislikeRules, isRemote: boolean = false) {
    const userSpace = getUserSpace(userName)
    // Convert structured DislikeListData back to rule-string for the overwrite filter
    const rulesString = dislikeData.dislikeList.map(s => s.dislikeRule ?? '').filter(Boolean).join('\n')
    await userSpace.dislikeManage.dislikeDataManage.overwirteDislikeInfo(rulesString)
    this.emit('dislike_data_overwrite', userName, dislikeData, isRemote)
    dislikeUpdated()
  }

  /**
   * 批量添加歌曲到列表
   * @param dislikeId 列表id
   * @param musicInfos 添加的歌曲信息
   * @param addMusicLocationType 添加在到列表的位置
   * @param isRemote 是否属于远程操作
   */
  async dislike_music_add(userName: string, musicInfo: LX.Dislike.DislikeSongInfo[], isRemote: boolean = false) {
    const userSpace = getUserSpace(userName)
    // const changedIds =
    await userSpace.dislikeManage.dislikeDataManage.addDislikeInfo(musicInfo)
    // await checkUpdateDislike(changedIds)
    this.emit('dislike_music_add', userName, musicInfo, isRemote)
    dislikeUpdated()
  }

  /**
   * 清空列表内的歌曲
   * @param ids 列表Id
   * @param isRemote 是否属于远程操作
   */
  async dislike_music_clear(userName: string, isRemote: boolean = false) {
    const userSpace = getUserSpace(userName)
    // const changedIds =
    await userSpace.dislikeManage.dislikeDataManage.overwirteDislikeInfo('')
    // await checkUpdateDislike(changedIds)
    this.emit('dislike_music_clear', userName, isRemote)
    dislikeUpdated()
  }
}


/**
 * EventMethods 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
type EventMethods = Omit<EventType, keyof EventEmitter>
/**
 * EventType 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
declare class EventType extends DislikeEvent {
  /**
   * 处理 on 对应的业务能力，参数和执行顺序保持原实现。
   * @param event event 原业务参数。
   * @param dislikeener dislikeener 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  on<K extends keyof EventMethods>(event: K, dislikeener: EventMethods[K]): this
  /**
   * 处理 once 对应的业务能力，参数和执行顺序保持原实现。
   * @param event event 原业务参数。
   * @param dislikeener dislikeener 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  once<K extends keyof EventMethods>(event: K, dislikeener: EventMethods[K]): this
  /**
   * 处理 off 对应的业务能力，参数和执行顺序保持原实现。
   * @param event event 原业务参数。
   * @param dislikeener dislikeener 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  off<K extends keyof EventMethods>(event: K, dislikeener: EventMethods[K]): this
}
/**
 * DislikeEventType 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export type DislikeEventType = Omit<EventType, keyof Omit<EventEmitter, 'on' | 'off' | 'once'>>
