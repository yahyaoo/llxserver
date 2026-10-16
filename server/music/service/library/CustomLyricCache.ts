import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { resolveMusicFile } from '../../../application/library/MusicDirectoryService'
import { libraryStatePath } from './ScanStateStore'
import { readMusicMetadata } from './MusicMetadataWorker'
import { customIndexManager, type MediaEnsureOptions } from './CustomMusicService'
import { getLyricFetcher } from '../cache/FileCacheService'
import { parseLyrics } from '../../../utils/lrcTool'

const pending = new Map<string, Promise<any>>()
const versions = new Map<string, { signature: string; version: string }>()
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
const cachePath = (username: string, filename: string) => path.join(path.dirname(libraryStatePath(username, 'prefetch_state.json')), 'media', hash(filename) + '.lyrics')
export async function customMediaFingerprint(username: string, filename: string, kind: 'cover' | 'lyric') {
  const file = resolveMusicFile(username, filename), item = customIndexManager.load(username).get(filename)
  if (!file || !item) throw Error('文件已删除或目录已停用')
  const stat = await fs.promises.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('文件不安全')
  let sidecar = ''
  if (kind === 'lyric') {
    try {
      const value = await fs.promises.lstat(file.slice(0, -path.extname(file).length) + '.lrc')
      if (value.isSymbolicLink() || !value.isFile()) throw Error('不允许歌词链接')
      sidecar = value.size + ':' + value.mtimeMs
    } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  }
  return { file, item, stat, signature: hash(JSON.stringify([stat.size, stat.mtimeMs, kind === 'cover' ? item.img : sidecar, item.source, item.songmid || item.id])) }
}
export const getLyricVersion = (username: string, filename: string) => {
  const item = customIndexManager.load(username).get(filename)
  const value = versions.get(username + ':' + filename)
  return item && value?.signature === item.size + ':' + item.mtime + ':' + (item.lyricVersion || '') ? value.version : undefined
}

/** Read-only cache: never write a sidecar into the user's music directory. */
export async function readCachedCustomLyrics(username: string, filename: string) {
  const before = await customMediaFingerprint(username, filename, 'lyric')
  try {
    const value = JSON.parse(await fs.promises.readFile(cachePath(username, filename), 'utf8'))
    if (value.signature === before.signature && value.lyrics?.lrc) {
      versions.set(username + ':' + filename, { signature: before.stat.size + ':' + before.stat.mtimeMs + ':' + (before.item.lyricVersion || ''), version: value.version })
      return value
    }
  } catch (error: any) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
  versions.delete(username + ':' + filename)
  return null
}
export async function ensureCustomLyrics(username: string, filename: string, options: MediaEnsureOptions = {}) {
  const before = await customMediaFingerprint(username, filename, 'lyric')
  const key = username + ':' + filename + ':' + before.signature + ':' + (options.network !== false)
  const existing = pending.get(key); if (existing) return existing
  const operation = (async () => {
    const cached = await readCachedCustomLyrics(username, filename)
    if (cached) return cached
    const lyricPath = before.file.slice(0, -path.extname(before.file).length) + '.lrc'
    let text: any
    try {
      const stat = await fs.promises.lstat(lyricPath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw Error('歌词文件不安全或过大')
      text = await fs.promises.readFile(lyricPath, 'utf8')
    } catch (error: any) { if (error.code !== 'ENOENT') throw error }
    if (!text?.trim()) text = await readMusicMetadata(before.file, before.stat.size + ':' + before.stat.mtimeMs, 'lyrics', !!options.background)
    if (!text && options.network !== false && !['custom', 'local', 'unknown'].includes(before.item.source) && (before.item.songmid || before.item.id)) {
      const fetch = getLyricFetcher()
      if (fetch) { if (options.runNetwork) text = await options.runNetwork(() => fetch(before.item)); else { await options.beforeNetwork?.(); text = await fetch(before.item) }; if (!text) throw Error('NETWORK: 歌词抓取失败') }
    }
    const lyrics = typeof text === 'string' ? parseLyrics(text) : text ? { ...text, lrc: text.lrc || text.lyric || '', klyric: text.klyric || text.lxlyric || '' } : null
    if (!lyrics?.lrc) return null
    const after = await customMediaFingerprint(username, filename, 'lyric')
    if (after.signature !== before.signature || after.file !== before.file) throw Error('BUSY: 歌词读取时文件变化')
    const version = hash(JSON.stringify(lyrics)), value = { signature: before.signature, version, lyrics }
    const target = cachePath(username, filename), temp = target + '.' + crypto.randomUUID() + '.tmp'
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    try { await fs.promises.writeFile(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); await fs.promises.rename(temp, target) }
    finally { await fs.promises.unlink(temp).catch(() => {}) }
    versions.set(username + ':' + filename, { signature: before.stat.size + ':' + before.stat.mtimeMs + ':' + (before.item.lyricVersion || ''), version })
    return value
  })().finally(() => pending.delete(key))
  pending.set(key, operation); return operation
}
export async function removeCustomLyricCache(username: string, filename: string) {
  versions.delete(username + ':' + filename)
  await fs.promises.unlink(cachePath(username, filename)).catch((error: any) => { if (error.code !== 'ENOENT') throw error })
}
