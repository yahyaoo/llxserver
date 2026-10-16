/* eslint-disable no-var */
import { type ListEventType, type DislikeEventType } from '../event'

declare global {
  interface Lx {
    logPath: string
    dataPath: string
    userPath: string
    config: LX.Config
    /** 远程备份接口，由应用入口装配。 */
    staticPath: string
    configPath: string
    saveConfig: () => void
    backupConfigNow?: () => { success: boolean, filename?: string, error?: string }
    getConfigBackupDir?: () => string
    lastCpuSample?: { idle: number, total: number }
    lastProcessSample?: { cpu: NodeJS.CpuUsage, time: number }
    subsonicPortConflict?: {
      port: number
      error: string
      time: number
    }
  }

  // var envParams: LX.EnvParams
  var lx: Lx
  var event_list: ListEventType
  var event_dislike: DislikeEventType

}

export { }
