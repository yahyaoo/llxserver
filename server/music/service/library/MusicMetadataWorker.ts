import { Worker } from 'node:worker_threads'

type Field = 'cover' | 'lyrics' | 'metadata'
interface Job { key: string; filename: string; field: Field; background: boolean; resolve: (value: any) => void; reject: (error: Error) => void }
const workers = new Set<Worker>(), idle: Worker[] = [], queue: Job[] = [], jobs = new Map<Worker, Job>()
const pending = new Map<string, Promise<any>>(), missing = new Map<string, number>()
let stopped = false
const source = String.raw`
const {parentPort,workerData} = require('node:worker_threads');
const {MusicTagger} = require(workerData.module);
parentPort.on('message', job => {
  let tagger;
  try {
    tagger = new MusicTagger(); tagger.loadPath(job.filename);
    const picture = job.field !== 'lyrics' ? tagger.pictures?.find(pic => pic?.data?.length) : null;
    const metadata = {title:tagger.title,artist:tagger.artist,album:tagger.album,duration:tagger.duration,bitRate:tagger.bitRate,sampleRate:tagger.sampleRate,bitDepth:tagger.bitDepth,quality:tagger.quality,lyrics:tagger.lyrics,pictures:picture ? [{data:[1]}] : []};
    parentPort.postMessage({value: job.field === 'metadata' ? metadata : job.field === 'lyrics' ? tagger.lyrics || null : picture ? {data: picture.data, mime: picture.mimeType} : null});
  } catch(error) { parentPort.postMessage({error:error.message}); }
  finally { try {tagger?.dispose();} catch {} }
});`

function pump() {
  if (stopped) return
  while (queue.length && (idle.length || workers.size < 2)) {
    let worker = idle.pop()
    if (!worker) {
      worker = new Worker(source, { eval: true, workerData: { module: require.resolve('music-tag-native') } })
      workers.add(worker)
      const owned = worker
      owned.on('message', message => {
        const job = jobs.get(owned); if (!job) return
        jobs.delete(owned)
        if (message.error) job.reject(Error(message.error)); else job.resolve(message.value)
        owned.unref(); idle.push(owned); pump()
      })
      const failed = (error: Error) => {
        jobs.get(owned)?.reject(error); jobs.delete(owned); workers.delete(owned)
        const index = idle.indexOf(owned); if (index >= 0) idle.splice(index, 1)
        void owned.terminate(); pump()
      }
      owned.on('error', failed)
      owned.on('exit', code => { if (workers.has(owned)) failed(Error('标签线程退出：' + code)) })
    }
    const foreground = queue.findIndex(job => !job.background)
    const job = queue.splice(foreground < 0 ? 0 : foreground, 1)[0]
    jobs.set(worker, job); worker.ref(); worker.postMessage({ filename: job.filename, field: job.field })
  }
}

/** Reusable two-worker pool; shared version promises, foreground priority, finite negative TTL. */
export function readMusicMetadata(filename: string, version: string, field: Field, background = false): Promise<any> {
  if (stopped) return Promise.reject(Error('标签服务已停止'))
  const key = filename + ':' + version + ':' + field
  if ((missing.get(key) || 0) > Date.now()) return Promise.resolve(null)
  const existing = pending.get(key)
  if (existing) { const job = queue.find(job => job.key === key); if (job && !background) job.background = false; return existing }
  const promise = new Promise<any>((resolve, reject) => { queue.push({ key, filename, field, background, resolve, reject }); pump() })
    .then(value => { if (!value) { if (missing.size >= 2000) missing.clear(); missing.set(key, Date.now() + 3600000) }; return value })
    .finally(() => pending.delete(key))
  pending.set(key, promise); return promise
}
export function startMetadataWorkers() { stopped = false }
export async function stopMetadataWorkers() {
  stopped = true
  for (const job of queue.splice(0)) job.reject(Error('标签服务已停止'))
  for (const job of jobs.values()) job.reject(Error('标签服务已停止'))
  jobs.clear(); idle.length = 0
  const owned = [...workers]; workers.clear(); await Promise.all(owned.map(worker => worker.terminate()))
  missing.clear()
}
