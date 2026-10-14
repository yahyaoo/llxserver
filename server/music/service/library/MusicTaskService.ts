/** 账号隔离的维护任务调度，进度不依赖页面生命周期。 @author yahyaoo @date 2026-10-12 */
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { serverEvents } from '../../../application/events/ServerEvents'
import { musicMaintenanceWorker } from './MusicMaintenanceWorker'

export const maintenanceActions = ['lyrics', 'embed', 'metadata', 'delete'] as const
export type MaintenanceAction = typeof maintenanceActions[number]
export interface MusicTask {
  origin?: 'auto' | 'manual' | 'scan'
  id: string; action: MaintenanceAction; status: 'running' | 'completed' | 'error'; total: number; completed: number;
  percent: number; succeeded: number; failed: number; skipped: number; startedAt: number; finishedAt?: number; errors: string[]
}
export interface TaskHooks {
  finished?(): void
  authorize?(value: any): Promise<boolean> | boolean
  prepare(index: number): Promise<unknown> | unknown
  lyrics(song: any): Promise<string | null>
  cover(song: any): Promise<unknown>
  result(index: number, result: any): Promise<void> | void
}
const tasks = new Map<string, Map<MaintenanceAction, MusicTask>>()
const completions = new Map<string, Promise<MusicTask>>()
export const waitMusicTask = (id: string) => completions.get(id)
/** 返回副本，调用方不能修改运行中的任务。 */
export const getMusicTasks = (username: string, includeAuto = false): MusicTask[] => Array.from(tasks.get(username)?.values() || []).filter(task => includeAuto || (task.origin !== 'auto' && task.origin !== 'scan')).map(task => ({ ...task, errors: task.errors.slice() }))
export class TaskConflict extends Error { statusCode = 409 }

/** 启动工作线程；同账号同类型任务互斥，不同维护类型也串行避免同时改写同一文件。 */
export const startMusicTask = (username: string, action: MaintenanceAction, total: number, hooks: TaskHooks, options: { origin?: 'auto' | 'manual' | 'scan' } = {}): MusicTask => {
  if (!maintenanceActions.includes(action)) throw new Error('不支持的维护操作')
  let owned = tasks.get(username)
  if (!owned) { owned = new Map(); tasks.set(username, owned) }
  if (Array.from(owned.values()).some(task => task.status === 'running')) throw new TaskConflict('上一次维护任务尚未完成，请稍等')
  const task: MusicTask = { id: randomUUID(), origin: options.origin || 'manual', action, status: 'running', total, completed: 0, percent: 0, succeeded: 0, failed: 0, skipped: 0, startedAt: Date.now(), errors: [] }
  let resolveCompletion: (value: MusicTask) => void = () => {}
  const completion = new Promise<MusicTask>(resolve => { resolveCompletion = resolve })
  completions.set(task.id, completion)
  owned.set(action, task)
  serverEvents.emitEvent('task:changed', { username, topic: 'maintenance', reason: 'state' })
  const finish = (error?: Error) => {
    if (task.status !== 'running') return
    task.status = error ? 'error' : 'completed'; task.finishedAt = Date.now(); task.percent = 100
    if (error) task.errors.push(error.message)
    hooks.finished?.()
    resolveCompletion({ ...task, errors: task.errors.slice() })
    // Caller captures completion immediately; finished tasks do not retain an unbounded promise history.
    completions.delete(task.id)
    serverEvents.emitEvent('task:changed', { username, topic: 'maintenance', reason: 'state' })
  }
  let worker: Worker
  try { worker = new Worker(musicMaintenanceWorker, { eval: true, workerData: { action, total, taggerModule: require.resolve('music-tag-native') } }) }
  catch (error) { finish(error as Error); return { ...task } }
  worker.on('message', async message => {
    if (message.type === 'done') { finish(); return }
    try {
      let data: unknown
      if (message.type === 'prepare') data = await hooks.prepare(message.data)
      else if (message.type === 'lyrics') data = await hooks.lyrics(message.data)
      else if (message.type === 'cover') data = await hooks.cover(message.data)
      else if (message.type === 'authorize') data = await hooks.authorize?.(message.data) ?? false
      else if (message.type === 'result') {
        const { index, result } = message.data
        await hooks.result(index, result)
        if (result.status === 'success') task.succeeded++
        else if (result.status === 'skipped') task.skipped++
        else { task.failed++; if (task.errors.length < 20) task.errors.push(result.reason || '处理失败') }
        task.completed++; task.percent = total ? Math.min(99, Math.floor(task.completed / total * 100)) : 0
        serverEvents.emitEvent('task:changed', { username, topic: 'maintenance', reason: 'progress' })
      }
      worker.postMessage({ id: message.id, data })
    } catch (error) { worker.postMessage({ id: message.id, error: (error as Error).message }) }
  })
  worker.on('error', finish)
  worker.on('exit', code => { if (task.status === 'running') finish(new Error('维护线程提前退出：' + code)) })
  return { ...task, errors: [] }
}
