import type { Server } from 'node:http'
const leases = new Set<string>()
let readers = 0
export const libraryHasReaders = () => readers > 0
export const acquireMaintenanceFile = (filename: string) => { if (leases.has(filename)) return false; leases.add(filename); return true }
export const releaseMaintenanceFile = (filename: string) => leases.delete(filename)
/** Coarse playback guard: retaining an audio HTTP response protects every automatic candidate. */
export function installLibraryReadGuard(server: Server) {
  const observe = (req: any, res: any) => {
    const subsonic = (global.lx?.config?.['subsonic.path'] || '/rest').replace(/\/+$/, '') + '/stream'
    if (!/(?:\/api\/music\/(?:cache|custom|server-download)\/file|\/api\/music\/(?:play|stream))/.test(req.url || '') && !(req.url || '').startsWith(subsonic)) return
    readers++
    let released = false
    const release = () => { if (released) return; released = true; readers--; res.off('finish', release); res.off('close', release) }
    res.once('finish', release); res.once('close', release)
  }
  server.prependListener('request', observe)
  server.once('close', () => server.off('request', observe))
}
