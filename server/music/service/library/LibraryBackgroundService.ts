import type { IncomingMessage, ServerResponse } from 'node:http'
import { startLibraryScanScheduler, stopLibraryScanScheduler, refreshLibraryWatches, libraryScanStatus } from './LibraryScanScheduler'
import { artworkLyricPrefetcher } from './ArtworkLyricPrefetcher'
import { libraryAutoFixService } from './LibraryAutoFixService'
import { libraryScanWriteService } from './LibraryScanWriteService'
import { startMetadataWorkers, stopMetadataWorkers } from './MusicMetadataWorker'

let running = false
export function startLibraryBackground() {
  if (running) return
  running = true; startMetadataWorkers()
  artworkLyricPrefetcher.onReady = (username, filename, kind) => { libraryAutoFixService.resourceReady(username, filename); libraryScanWriteService.resourceReady(username, filename, kind) }
  artworkLyricPrefetcher.start(); libraryAutoFixService.start(); libraryScanWriteService.start(); startLibraryScanScheduler()
}
export function refreshLibraryBackground() {
  if (!running) return
  refreshLibraryWatches(); artworkLyricPrefetcher.refresh(); libraryAutoFixService.refresh(); libraryScanWriteService.refresh()
}
export async function stopLibraryBackground() {
  if (!running) return
  running = false
  // Close admission immediately, then drain current tasks and commits before terminating read workers.
  const autoStop = libraryAutoFixService.stop(), prefetchStop = artworkLyricPrefetcher.stop(), scanWriteStop = libraryScanWriteService.stop()
  await stopLibraryScanScheduler(); await autoStop; await prefetchStop; await scanWriteStop; await stopMetadataWorkers()
}

/** Admin-only routes, dispatched before the music/user API branches. */
export async function handleLibraryAdmin(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const route = url.pathname
  const methods: Record<string, string> = {
    '/api/admin/library/scan/status': 'GET', '/api/admin/library/prefetch/status': 'GET',
    '/api/admin/library/prefetch/run': 'POST', '/api/admin/library/autofix/log': 'GET',
  }
  if (!(route in methods)) return false
  const respond = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  const password = global.lx.config['frontend.password']
  if (!password || req.headers['x-frontend-auth'] !== password) { respond(401, { success: false, message: 'Unauthorized' }); return true }
  if (req.method !== methods[route]) { respond(405, { success: false, message: 'Method not allowed' }); return true }
  const username = url.searchParams.get('user') || undefined
  if (username && !global.lx.config.users.some(user => user.name === username)) { respond(400, { success: false, message: '未知用户' }); return true }
  if (route === '/api/admin/library/scan/status') respond(200, { success: true, items: libraryScanStatus().filter(item => !username || item.username === username) })
  else if (route === '/api/admin/library/prefetch/status') respond(200, { success: true, items: artworkLyricPrefetcher.status(username) })
  else if (route === '/api/admin/library/autofix/log') respond(200, { success: true, items: libraryAutoFixService.log(username) })
  else {
    const mode = url.searchParams.get('mode') || 'backfill'
    if (!username || !['backfill', 'retry-failed'].includes(mode)) { respond(400, { success: false, message: '需要用户和 backfill 或 retry-failed 模式' }); return true }
    if (global.lx.config['library.prefetch.enabled'] === false) { respond(409, { success: false, message: '预取已关闭' }); return true }
    artworkLyricPrefetcher.run(username, mode as 'backfill' | 'retry-failed'); respond(202, { success: true })
  }
  return true
}
