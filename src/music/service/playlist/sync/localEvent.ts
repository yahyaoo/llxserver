/** 歌单本地事件桥接：订阅数据变化并发送同步协议消息。 @author yahyaoo */
// import { updateDeviceSnapshotKey } from '@main/modules/sync/data'
// import { registerListActionEvent } from '../../../utils'
// import { getCurrentListInfoKey } from '../../utils'

// let socket: LX.Sync.Server.Socket | null
let unregisterLocalListAction: (() => void) | null


// const sendListAction = async(wss: LX.SocketServer, action: LX.Sync.List.ActionList) => {
//   // console.log('sendListAction', action.action)
//   const key = await getCurrentListInfoKey()
//   for (const client of wss.clients) {
//     if (!client.moduleReadys?.list) continue
//     void client.remoteQueueList.onListSyncAction(action).then(() => {
//       updateDeviceSnapshotKey(client.keyInfo, key)
//     })
//   }
// }

/**
 * 注册本地数据事件监听，将变更转为同步协议消息。
 * @param wss 同步 WebSocket 服务。
 * @author yahyaoo
 */
export const registerEvent = (wss: LX.SocketServer) => {
  // socket = _socket
  // socket.onClose(() => {
  //   unregisterLocalListAction?.()
  //   unregisterLocalListAction = null
  // })
  // unregisterEvent()
  // unregisterLocalListAction = registerListActionEvent((action) => {
  //   void sendListAction(wss, action)
  // })
}

/**
 * 解除本地数据事件监听，释放用户同步订阅。
 * @author yahyaoo
 */
export const unregisterEvent = () => {
  unregisterLocalListAction?.()
  unregisterLocalListAction = null
}
