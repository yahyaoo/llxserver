export const automaticActionEnabled = (action: string) => global.lx?.config?.['library.autoFix.safeWrite'] !== false && (action === 'embed'
  ? global.lx?.config?.['library.autoFix.embedLyric'] === 'on' || (global.lx?.config?.['library.autoFix.embedLyric'] === 'follow-download' && global.lx?.config?.['download.lyricMode'] === 'embedded')
  : action === 'metadata' && global.lx?.config?.['library.autoFix.retag'] === 'fill-missing')

export function inQuietHours(value: string, now = new Date()): boolean {
  if (!value) return true
  if (!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false
  const [start, end] = value.split('-').map(time => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes })
  const current = now.getHours() * 60 + now.getMinutes()
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end)
}
