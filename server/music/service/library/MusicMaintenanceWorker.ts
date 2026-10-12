/** 音乐维护工作线程：文件操作在子线程中串行执行。 @author yahyaoo @date 2026-10-12 */
export const musicMaintenanceWorker = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs'), path = require('node:path');
const { MusicTagger, MetaPicture } = require(workerData.taggerModule);
let sequence = 0;
const waiting = new Map();
parentPort.on('message', message => { const pending = waiting.get(message.id); if (pending) { waiting.delete(message.id); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.data); } });
function request(type, data) { return new Promise((resolve, reject) => { const id = ++sequence; waiting.set(id, { resolve, reject }); parentPort.postMessage({ type, id, data }); }); }
async function processItem(item) {
  if (item.skip) return { status: 'skipped', reason: item.skip };
  const file = item.path;
  if (workerData.action === 'embed') {
    const existing = new MusicTagger();
    try { existing.loadPath(file); if (existing.lyrics?.trim()) return { status: 'skipped', hasEmbedLyric: true, reason: '已有嵌入歌词' }; }
    finally { existing.dispose(); }
  }
  if (workerData.action === 'delete') {
    fs.unlinkSync(file);
    for (const sidecar of item.sidecars || []) { try { fs.unlinkSync(sidecar); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    return { status: 'success', deleted: true };
  }
  const lyricFile = item.lyricPath;
  if (lyricFile && fs.existsSync(lyricFile) && fs.lstatSync(lyricFile).isSymbolicLink()) throw new Error('不允许操作歌词符号链接');
  let lyrics = lyricFile && fs.existsSync(lyricFile) ? fs.readFileSync(lyricFile, 'utf8') : '';
  if (workerData.action === 'lyrics' || workerData.action === 'embed') {
    if (!lyrics.trim()) lyrics = await request('lyrics', item.song);
    if (!lyrics || !lyrics.trim()) throw new Error('没有获取到歌词');
    if (workerData.action === 'lyrics') {
      fs.mkdirSync(path.dirname(lyricFile), { recursive: true }); fs.writeFileSync(lyricFile, lyrics, 'utf8');
      return { status: 'success', hasLyric: true };
    }
  }
  let tagger;
  try {
    tagger = new MusicTagger(); tagger.loadPath(file);
    if (workerData.action === 'embed') {
      if (tagger.lyrics && tagger.lyrics.trim()) return { status: 'skipped', hasEmbedLyric: true, reason: '已有嵌入歌词' };
      tagger.lyrics = lyrics;
    } else {
      if (item.song.name) tagger.title = item.song.name;
      if (item.song.singer) tagger.artist = item.song.singer;
      if (item.song.albumName || item.song.album) tagger.album = item.song.albumName || item.song.album;
      const cover = await request('cover', item.song);
      if (cover) tagger.pictures = [new MetaPicture(cover.mime, new Uint8Array(cover.data), 'Cover')];
    }
    tagger.save();
    const stat = fs.statSync(file);
    return { status: 'success', hasEmbedLyric: !!tagger.lyrics, hasCover: !!tagger.pictures?.some(pic => pic.data?.length), mtime: stat.mtimeMs, size: stat.size };
  } finally { try { tagger?.dispose(); } catch {} }
}
(async () => {
  for (let index = 0; index < workerData.total; index++) {
    let result;
    try { const item = await request('prepare', index); result = await processItem(item); }
    catch (error) { result = { status: 'failed', reason: error.message }; }
    await request('result', { index, result });
  }
  parentPort.postMessage({ type: 'done' }); parentPort.close();
})().catch(error => { throw error; });
`
