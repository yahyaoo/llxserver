import { registerTask, unregisterTask } from '../task/SchedulerService'
import { getMusicDirectories } from '../../../application/library/MusicDirectoryService'
import { getScanStateStore, getScanStatus, syncCustomIndex, waitForScans, type ScanOptions } from './CustomMusicService'
import { libraryWatcher } from './LibraryWatcher'

const jobs = new Map<string, { username: string; options: ScanOptions }>()
let running = false, stopped = true, startedAt = 0
let startup: NodeJS.Timeout | undefined
const retryPaths = new Map<string, string[]>()
const retryFull = new Set<string>()

/** Full and paths are separate queue entries: a quick scan can never swallow file-change hints. */
export function queueLibraryScan(username: string, options: ScanOptions) {
  if (stopped || (options.reason !== 'manual' && global.lx.config['library.scan.enabled'] === false)) return
  const key = username + ':' + (options.directoryIds || []).join(',') + ':' + options.mode
  const previous = jobs.get(key)
  if (previous?.options.paths && options.paths) for (const [id, values] of Object.entries(options.paths)) {
    previous.options.paths[id] = [...new Set([...(previous.options.paths[id] || []), ...values])]
    if (previous.options.paths[id].length > 500) { previous.options.mode = 'full'; previous.options.paths = undefined; break }
  }
  else jobs.set(key, { username, options })
  void drain()
}
async function drain() {
  if (running) return
  running = true
  try {
    while (!stopped && jobs.size) {
      const [key, job] = jobs.entries().next().value!
      jobs.delete(key)
      if (job.options.reason !== 'manual' && global.lx.config['library.scan.enabled'] === false) continue
      try {
        await syncCustomIndex(job.username, true, true, job.options)
        for (const id of job.options.directoryIds || []) {
          const retryKey = job.username + ':' + id
          if (job.options.mode === 'full') { retryFull.delete(retryKey); retryPaths.delete(retryKey) }
          else if (job.options.mode === 'paths') {
            const remaining = (retryPaths.get(retryKey) || []).filter(value => !job.options.paths?.[id]?.includes(value))
            if (remaining.length) retryPaths.set(retryKey, remaining); else retryPaths.delete(retryKey)
          }
        }
      } catch (error) {
        console.warn('[音乐扫描] 任务保留待下一次调度', error)
        if (job.options.mode === 'paths') for (const [id, values] of Object.entries(job.options.paths || {})) { const retryKey = job.username + ':' + id; retryPaths.set(retryKey, [...new Set([...(retryPaths.get(retryKey) || []), ...values])]) }
        else if (job.options.mode === 'full') for (const id of job.options.directoryIds || []) retryFull.add(job.username + ':' + id)
      }
    }
  } finally { running = false }
}
export function refreshLibraryWatches() {
  const config = global.lx.config as unknown as Record<string, any>
  const names = new Set((global.lx.config.users || []).map(user => user.name))
  for (const status of libraryWatcher.getStatus()) if (!names.has(status.username)) libraryWatcher.configure(status.username, [], config, onDirty)
  for (const user of global.lx.config.users || []) libraryWatcher.configure(user.name, getMusicDirectories(user.name), config, onDirty)
}
function onDirty(username: string, id: string, paths: string[], uncertain: boolean) {
  queueLibraryScan(username, { mode: uncertain ? 'full' : 'paths', directoryIds: [id], paths: { [id]: paths }, reason: 'watch' })
}
export async function libraryScanTick() {
  if (stopped) return
  refreshLibraryWatches()
  if (global.lx.config['library.scan.enabled'] === false || startup) return
  const now = Date.now(), config = global.lx.config
  // Avoid SchedulerService's initial three-second tick bypassing the configured startup delay.
  if (now - startedAt < 60000) return
  for (const user of config.users || []) for (const directory of getMusicDirectories(user.name)) {
    if (getScanStatus(user.name).status === 'running') continue
    const state = getScanStateStore(user.name).get(directory.id, directory.path)
    const watch = libraryWatcher.getStatus(user.name).find(item => item.directoryId === directory.id)
    const minimum = config['library.scan.watchMode'] === 'polling' ? 5 : watch?.state === 'active' ? 360 : 1
    const interval = Math.max(directory.scanMinutes, minimum) * 60000
    const fullHours = config['library.scan.fullScanHours'] ?? 24
    const retry = retryPaths.get(user.name + ':' + directory.id)
    if (retry) queueLibraryScan(user.name, { mode: 'paths', directoryIds: [directory.id], paths: { [directory.id]: retry }, reason: 'watch' })
    if (retryFull.has(user.name + ':' + directory.id) || !Object.keys(state.folders).length || (fullHours > 0 && now - state.lastFullScanAt >= fullHours * 3600000)) queueLibraryScan(user.name, { mode: 'full', directoryIds: [directory.id], reason: 'schedule' })
    else if (now - state.lastQuickScanAt >= interval) queueLibraryScan(user.name, { mode: 'quick', directoryIds: [directory.id], reason: 'schedule' })
  }
}
export function startLibraryScanScheduler() {
  if (!stopped) return
  stopped = false; startedAt = Date.now(); refreshLibraryWatches()
  registerTask({ id: 'libraryScanTick', name: '音乐库增量扫描', enabled: true, isRunning: false, intervalMs: 60000, run: async () => {
    await libraryScanTick(); return { taskId: 'libraryScanTick', timestamp: Date.now(), success: true, message: '扫描任务已按目录状态排队' }
  } })
  const seconds = global.lx.config['library.scan.startupDelaySeconds'] ?? 60
  if (seconds > 0) {
    // Owner: library scheduler. Cleared on stop; callback rechecks the current configuration.
    startup = setTimeout(() => {
      startup = undefined
      if (global.lx.config['library.scan.enabled'] !== false) for (const user of global.lx.config.users || []) queueLibraryScan(user.name, { mode: 'quick', reason: 'startup' })
    }, seconds * 1000)
    startup.unref()
  }
}
export async function stopLibraryScanScheduler() {
  stopped = true; if (startup) clearTimeout(startup); startup = undefined
  unregisterTask('libraryScanTick'); libraryWatcher.stop(); jobs.clear(); retryPaths.clear(); retryFull.clear(); await waitForScans()
}
export function libraryScanStatus() {
  return (global.lx.config.users || []).flatMap(user => getMusicDirectories(user.name, true).map(directory => ({ username: user.name, directoryId: directory.id, scan: getScanStatus(user.name), ...getScanStateStore(user.name).get(directory.id, directory.path), watch: libraryWatcher.getStatus(user.name).find(item => item.directoryId === directory.id) || { state: 'disabled' } })))
}
