/** types 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
export interface TaskExecutionResult {
  /**
   * taskId 字段，沿用原业务结构与空值约定。
   */
  taskId: string
  /**
   * timestamp 字段，沿用原业务结构与空值约定。
   */
  timestamp: number
  /**
   * success 字段，沿用原业务结构与空值约定。
   */
  success: boolean
  /**
   * message 字段，沿用原业务结构与空值约定。
   */
  message: string
  /**
   * details 字段，沿用原业务结构与空值约定。
   */
  details?: any
}

/**
 * ScheduledTask 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface ScheduledTask {
  /**
   * id 字段，沿用原业务结构与空值约定。
   */
  id: string
  /**
   * name 字段，沿用原业务结构与空值约定。
   */
  name: string
  /**
   * intervalMs 字段，沿用原业务结构与空值约定。
   */
  intervalMs: number
  /**
   * enabled 字段，沿用原业务结构与空值约定。
   */
  enabled: boolean
  /**
   * lastRunTime 字段，沿用原业务结构与空值约定。
   */
  lastRunTime?: number
  /**
   * nextRunTime 字段，沿用原业务结构与空值约定。
   */
  nextRunTime?: number
  /**
   * isRunning 字段，沿用原业务结构与空值约定。
   */
  isRunning: boolean
  /**
   * lastResult 字段，沿用原业务结构与空值约定。
   */
  lastResult?: TaskExecutionResult
  /**
   * run 字段，沿用原业务结构与空值约定。
   */
  run: () => Promise<TaskExecutionResult>
}
