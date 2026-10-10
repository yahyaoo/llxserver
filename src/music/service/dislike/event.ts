/** 不喜欢规则事件总线：处理数据变更并通知快照和同步监听者。 @author yahyaoo */
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
 * 在不喜欢数据变化后生成快照并通知同步客户端。
 * @param changedIds 本次变更涉及的记录 ID。
 * @author yahyaoo
 */
export const checkUpdateDislike = async(changedIds: string[]) => {
  // if (!changedIds.length) return
  // await saveDislikeMusics(changedIds.map(id => ({ id, musics: allMusicDislike.get(id) as LX.Dislike.DislikeMusics })))
  // global.app_event.myDislikeMusicUpdate(changedIds)
}


/** 用户不喜欢数据事件总线，连接本地修改、快照与同步通知。 @author yahyaoo */
export class DislikeEvent extends EventEmitter {
  /**
 * 标记不喜欢数据变化，触发后续快照与同步通知。
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


/** 用户数据事件的方法名及对应参数映射。 @author yahyaoo */
type EventMethods = Omit<EventType, keyof EventEmitter>
/** 数据事件名称到处理函数参数的类型映射。 @author yahyaoo */
declare class EventType extends DislikeEvent {
  /**
 * 订阅用户空间的数据变动事件。
 * @param event 数据事件名称。
 * @param dislikeener 不喜欢数据监听函数。
 * @author yahyaoo
 */
  on<K extends keyof EventMethods>(event: K, dislikeener: EventMethods[K]): this
  /**
 * 订阅一次数据变动事件，触发后自动取消监听。
 * @param event 数据事件名称。
 * @param dislikeener 不喜欢数据监听函数。
 * @author yahyaoo
 */
  once<K extends keyof EventMethods>(event: K, dislikeener: EventMethods[K]): this
  /**
 * 取消指定用户空间事件监听。
 * @param event 数据事件名称。
 * @param dislikeener 不喜欢数据监听函数。
 * @author yahyaoo
 */
  off<K extends keyof EventMethods>(event: K, dislikeener: EventMethods[K]): this
}
/** 不喜欢事件总线公开的订阅与通知方法集合。 @author yahyaoo */
export type DislikeEventType = Omit<EventType, keyof Omit<EventEmitter, 'on' | 'off' | 'once'>>
