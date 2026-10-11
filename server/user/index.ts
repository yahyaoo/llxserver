import { UserDataManage } from './data'
import storageFs from '../application/persistence/documentFileSystem'
import { initializeUserDocuments } from '../music/service/configuration/UserInitializationService'
import {
  ListManage,
  DislikeManage,
} from '../modules'

export interface UserSpace {
  dataManage: UserDataManage
  listManage: ListManage
  dislikeManage: DislikeManage
  getDecices: () => Promise<LX.Sync.KeyInfo[]>
  removeDevice: (clientId: string) => Promise<void>
}
const users = new Map<string, UserSpace>()
const renamingUsers = new Set<string>()

const delayTime = 60 * 60 * 1000 // 延长到 1 小时
const delayReleaseTimeouts = new Map<string, NodeJS.Timeout>()
const clearDelayReleaseTimeout = (userName: string) => {
  if (!delayReleaseTimeouts.has(userName)) return

  clearTimeout(delayReleaseTimeouts.get(userName))
  delayReleaseTimeouts.delete(userName)
}
const seartDelayReleaseTimeout = (userName: string) => {
  clearDelayReleaseTimeout(userName)
  delayReleaseTimeouts.set(userName, setTimeout(() => {
    users.delete(userName)
  }, delayTime))
}

/**
 * 加载用户空间并按默认值补齐首次使用的账号文档。
 * @param userName 已认证账号或公共账号名称。
 * @returns 保留既有歌单和设置的用户空间。
 * @throws Error 账号重命名或默认数据持久化失败。
 * @author jingyh
 */
export const getUserSpace = (userName: string) => {
  if (renamingUsers.has(userName)) {
    throw new Error(`User ${userName} is being renamed, access denied temporarily`)
  }
  clearDelayReleaseTimeout(userName)

  let user = users.get(userName)
  if (!user) {
    console.log('[用户空间] 初始化用户数据管理器:', userName)
    const dataManage = new UserDataManage(userName)
    initializeUserDocuments(dataManage.userDir)
    const listManage = new ListManage(dataManage)
    const dislikeManage = new DislikeManage(dataManage)
    users.set(userName, user = {
      dataManage,
      listManage,
      dislikeManage,
      async getDecices() {
        return this.dataManage.getAllClientKeyInfo()
      },
      async removeDevice(clientId) {
        await listManage.removeDevice(clientId)
        await dataManage.removeClientKeyInfo(clientId)
      },
    })
  }
  return user
}

export const releaseUserSpace = (userName: string, force = false) => {
  if (force) {
    clearDelayReleaseTimeout(userName)
    users.delete(userName)
  } else seartDelayReleaseTimeout(userName)
}

/**
 * 备份恢复后更新已加载用户的快照与歌单；保持用户空间对象引用，避免中断同步连接。
 * @returns 所有已加载空间完成恢复后的结果。
 * @author yahyaoo
 */
export const reloadActiveUserSpaces = async (): Promise<void> => {
  for (const space of users.values()) {
    await space.listManage.listDataManage.initPromise
    for (const snapshots of [space.listManage.snapshotDataManage, space.dislikeManage.snapshotDataManage]) {
      if (!storageFs.existsSync(snapshots.snapshotInfoFilePath)) continue
      const info = JSON.parse(storageFs.readFileSync(snapshots.snapshotInfoFilePath, 'utf8'))
      snapshots.snapshotInfo = info
      snapshots.clientSnapshotKeys = Object.values(info.clients || {}).map((client: any) => client.snapshotKey).filter(Boolean)
    }
    const lists = space.listManage.snapshotDataManage
    if (lists.snapshotInfo.latest) {
      const data = await lists.getSnapshot(lists.snapshotInfo.latest)
      if (data) await space.listManage.listDataManage.restore(data)
    }
    const dislike = space.dislikeManage.snapshotDataManage
    if (dislike.snapshotInfo.latest) {
      const data = await dislike.getSnapshot(dislike.snapshotInfo.latest)
      if (data) space.dislikeManage.dislikeDataManage.dislikeRules = data
    }
  }
}

/**
 * 重命名用户空间缓存并加锁
 * @param oldName 旧用户名
 */
export const renameUserSpace = (oldName: string) => {
  clearDelayReleaseTimeout(oldName)
  users.delete(oldName)
  renamingUsers.add(oldName)
}

/**
 * 解除重命名锁定
 * @param oldName 旧用户名
 */
export const finishRenameUserSpace = (oldName: string) => {
  renamingUsers.delete(oldName)
}

/**
 * 动态更新所有用户空间的快照存储路径（热迁移无需重启）
 * @param newBackupPath 新的 snapshot.backupPath 配置
 */
export const updateAllUserSnapshotDirs = (newBackupPath?: string) => {
  for (const [name, space] of users.entries()) {
    try {
      space.listManage.snapshotDataManage.updateSnapshotDir(newBackupPath)
    } catch (e) {
      console.error(`[Snapshot] Failed to hot-update snapshot dir for user ${name}:`, e)
    }
  }
}

export * from './data'
