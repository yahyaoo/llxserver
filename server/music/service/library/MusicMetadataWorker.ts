import { Worker } from 'node:worker_threads'

/** 限制原生标签读取的并发，封面与歌词解析不占用 HTTP 主线程。 */
const waiting: Array<() => void> = []
let active = 0
const pending = new Map<string, Promise<any>>()
const missing = new Set<string>()

/** 同一文件版本只读取一次，缺失封面使用有界负缓存。 */
export function readMusicMetadata(filename: string, version: string, field: 'cover' | 'lyrics' | 'metadata'): Promise<any> {
  const key = filename + ':' + version + ':' + field
  if (missing.has(key)) return Promise.resolve(null)
  const existing = pending.get(key)
  if (existing) return existing
  const result = (async () => {
    if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve))
    else active++
    try {
      return await new Promise<any>((resolve, reject) => {
        const worker = new Worker(`
          const {parentPort,workerData} = require('node:worker_threads');
          const {MusicTagger} = require(workerData.module);
          let tagger;
          try {
            tagger = new MusicTagger(); tagger.loadPath(workerData.filename);
            const picture = workerData.field !== 'lyrics' ? tagger.pictures?.find(pic => pic?.data?.length) : null;
            const metadata = {title:tagger.title,artist:tagger.artist,album:tagger.album,duration:tagger.duration,bitRate:tagger.bitRate,sampleRate:tagger.sampleRate,bitDepth:tagger.bitDepth,quality:tagger.quality,lyrics:tagger.lyrics,pictures:picture ? [{data:[1]}] : []};
            parentPort.postMessage(workerData.field === 'metadata' ? metadata : workerData.field === 'lyrics' ? tagger.lyrics || null : picture ? {data: picture.data, mime: picture.mimeType} : null);
          } catch { parentPort.postMessage(null); }
          finally { try {tagger?.dispose();} catch {} }
        `, { eval: true, workerData: { filename, field, module: require.resolve('music-tag-native') } })
        let received = false
        worker.once('message', value => { received = true; resolve(value) })
        worker.once('error', reject)
        worker.once('exit', code => { if (!received) reject(new Error('标签线程退出：' + code)) })
      })
    } finally {
      const next = waiting.shift()
      if (next) next(); else active--
    }
  })().then(value => {
    if (!value) { if (missing.size >= 2000) missing.clear(); missing.add(key) }
    return value
  }).finally(() => pending.delete(key))
  pending.set(key, result)
  return result
}
