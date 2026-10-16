/** 音乐维护工作线程：文件操作在子线程中串行执行。 @author yahyaoo @date 2026-10-12 */
import { safeAudioSource } from './SafeMusicWrite'
export const musicMaintenanceWorker = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs'), path = require('node:path');
const { MusicTagger, MetaPicture } = require(workerData.taggerModule);
let sequence = 0;
const waiting = new Map();
parentPort.on('message', message => { const pending = waiting.get(message.id); if (pending) { waiting.delete(message.id); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.data); } });
function request(type, data) { return new Promise((resolve, reject) => { const id = ++sequence; waiting.set(id, { resolve, reject }); parentPort.postMessage({ type, id, data }); }); }
` + safeAudioSource + String.raw`
async function processItem(item) {
  if (item.skip) return { status: 'skipped', reason: item.skip };
  const file = item.path;
  const automatic = item.origin === 'auto' || item.origin === 'scan';
  if (automatic && workerData.action !== 'lyrics' && (!item.safeWrite || !item.exclusive || !['.mp3','.flac','.m4a'].includes(path.extname(file).toLowerCase()))) return {status:'skipped', reason:'缺少已验证的安全写入保护'};
  let stage, original, audio, beforeMetadata;
  try {
  if (automatic && workerData.action !== 'lyrics') {
    if (fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== file) throw Error('文件路径发生变化');
    original = fs.statSync(file);
    if (original.size !== item.expected.size || original.mtimeMs !== item.expected.mtimeMs || original.ino !== item.expected.ino) return {status:'skipped',reason:'BUSY: 原文件发生变化'};
    audio = audioFingerprint(file);
    const probe = new MusicTagger();
    try { probe.loadPath(file); beforeMetadata={duration:probe.duration,title:probe.title,artist:probe.artist,album:probe.album,pictures:probe.pictures?.map(pic=>({mime:pic.mimeType,data:Buffer.from(pic.data)})) || []}; }
    finally {probe.dispose();}
    if (!Number.isFinite(beforeMetadata.duration) || beforeMetadata.duration <= 0) throw Error('音频时长无效，保留原文件');
    const space = fs.statfsSync(path.dirname(file));
    if (space.bavail * space.bsize < original.size * 2 + 8*1024*1024) return {status:'skipped',reason:'磁盘空间不足'};
    stage = path.join(path.dirname(file), '.llx-auto-' + require('node:crypto').randomUUID() + path.extname(file));
    fs.copyFileSync(file,stage,fs.constants.COPYFILE_EXCL);
    fs.chmodSync(stage,original.mode);
  }
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
  if (workerData.action === 'lyrics' && item.origin === 'scan' && lyricFile && fs.existsSync(lyricFile)) return { status: 'skipped', hasLyric: true, reason: '旁挂歌词已存在' };
  let lyrics = lyricFile && fs.existsSync(lyricFile) ? fs.readFileSync(lyricFile, 'utf8') : '';
  if (workerData.action === 'lyrics' || workerData.action === 'embed') {
    if (!lyrics.trim()) lyrics = await request('lyrics', item.song);
    if (!lyrics || !lyrics.trim()) throw new Error('没有获取到歌词');
    if (workerData.action === 'lyrics') {
      fs.mkdirSync(path.dirname(lyricFile), { recursive: true });
      if (item.origin !== 'scan') { fs.writeFileSync(lyricFile, lyrics, 'utf8'); return { status: 'success', hasLyric: true }; }
      let fd;
      let created = false;
      try { fd = fs.openSync(lyricFile, 'wx'); created = true; fs.writeFileSync(fd, lyrics, 'utf8'); fs.fsyncSync(fd); }
      catch (error) { if (created) { try { fs.unlinkSync(lyricFile); } catch {} } throw error; }
      finally { if (fd !== undefined) fs.closeSync(fd); }
      return { status: 'success', hasLyric: true };
    }
  }
  let tagger;
  try {
    tagger = new MusicTagger(); tagger.loadPath(stage || file);
    if (workerData.action === 'embed') {
      if (tagger.lyrics && tagger.lyrics.trim()) return { status: 'skipped', hasEmbedLyric: true, reason: '已有嵌入歌词' };
      tagger.lyrics = lyrics;
    } else {
      const fill = item.mode === 'fill-missing';
      if (!item.coverOnly) {
        if (item.song.name && (!fill || !tagger.title?.trim())) tagger.title = item.song.name;
        if (item.song.singer && (!fill || !tagger.artist?.trim())) tagger.artist = item.song.singer;
        if ((item.song.albumName || item.song.album) && (!fill || !tagger.album?.trim())) tagger.album = item.song.albumName || item.song.album;
      }
      const cover = !fill || !tagger.pictures?.length ? await request('cover', item.song) : null;
      if (cover) tagger.pictures = [new MetaPicture(cover.mime, new Uint8Array(cover.data), 'Cover')];
    }
    tagger.save();
    const changedFields = [];
    if (automatic) {
      tagger.dispose(); tagger = null;
      const afterAudio = audioFingerprint(stage);
      if (afterAudio.hash !== audio.hash || afterAudio.bytes !== audio.bytes) throw Error('音频内容校验失败，保留原文件');
      const verified = new MusicTagger();
      try {
        verified.loadPath(stage);
        if (Math.abs((verified.duration || 0) - (beforeMetadata.duration || 0)) > 1) throw Error('音频时长校验失败');
        for (const key of ['title','artist','album']) {
          if (item.mode === 'fill-missing' && beforeMetadata[key]?.trim() && verified[key] !== beforeMetadata[key]) throw Error('已有标签被覆盖');
          if (verified[key] !== beforeMetadata[key]) changedFields.push(key);
        }
        if (workerData.action === 'embed' && verified.lyrics !== lyrics) throw Error('歌词读回校验失败');
        if (workerData.action === 'embed') changedFields.push('lyrics');
        if (beforeMetadata.pictures.length) {
          const pictures=verified.pictures || [];
          if (pictures.length !== beforeMetadata.pictures.length || pictures.some((pic,index)=>!Buffer.from(pic.data).equals(beforeMetadata.pictures[index].data))) throw Error('已有图片被覆盖');
        } else if (verified.pictures?.length) changedFields.push('pictures');
      } finally { verified.dispose(); }
      if (!changedFields.length) return {status:'skipped',reason:'标签已完整'};
      if (!await request('authorize', {path:file,expected:item.expected})) return {status:'skipped',reason:'BUSY: 写入已取消或原文件变化'};
      const latest=fs.lstatSync(file);
      if (latest.isSymbolicLink() || fs.realpathSync(file)!==file || latest.size!==original.size || latest.mtimeMs!==original.mtimeMs || latest.ino!==original.ino || audioFingerprint(file).hash!==audio.hash) throw Error('原文件变化，保留外部修改');
      // One same-directory rename replaces only after validation. Never unlink the original first.
      const fd=fs.openSync(stage,'r+'); try {fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
      fs.renameSync(stage,file); stage=undefined;
      tagger = new MusicTagger(); tagger.loadPath(file);
    }
    const stat = fs.statSync(file);
    return { status: 'success', fields: changedFields, hasEmbedLyric: !!tagger.lyrics, hasCover: !!tagger.pictures?.some(pic => pic.data?.length), mtime: stat.mtimeMs, size: stat.size };
  } finally { try { tagger?.dispose(); } catch {} }
  } finally { if (stage) { try { fs.unlinkSync(stage); } catch {} } }
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
