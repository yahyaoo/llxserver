/** localEvent 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
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
 * 注册 registerEvent 对应的业务能力，参数和执行顺序保持原实现。
 * @param wss wss 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
 * 注销 unregisterEvent 对应的业务能力，参数和执行顺序保持原实现。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const unregisterEvent = () => {
  unregisterLocalListAction?.()
  unregisterLocalListAction = null
}
