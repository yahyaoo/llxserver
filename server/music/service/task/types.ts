/** 后台任务调度的数据结构和执行状态定义。 @author yahyaoo */
export interface TaskExecutionResult {

  taskId: string
  /** 记录生成时间，单位毫秒。 */
  timestamp: number

  success: boolean
  /** 处理结果或错误说明。 */
  message: string

  details?: any
}

/** 后台任务定义，记录执行间隔、运行状态、执行函数和最近结果。 @author yahyaoo */
export interface ScheduledTask {
  /** 业务记录标识。 */
  id: string
  /** 记录显示名称。 */
  name: string
  /** 任务执行间隔，单位毫秒。 */
  intervalMs: number
  /** 功能是否启用。 */
  enabled: boolean
  /** 后台任务最近执行时间。 */
  lastRunTime?: number
  /** 后台任务下次计划执行时间。 */
  nextRunTime?: number
  /** 任务是否正在执行。 */
  isRunning: boolean
  /** 后台任务最近执行结果。 */
  lastResult?: TaskExecutionResult
  /** 任务实际执行函数。 */
  run: () => Promise<TaskExecutionResult>
}
