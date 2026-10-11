/** 工作线程内遍历目录和读取原生标签，避免大量文件阻塞 HTTP 主线程。 */
export const musicScanWorker = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { MusicTagger } = require(workerData.taggerModule);
const prior = new Map(workerData.previous.map(item => [item.filename, item]));
const extensions = new Set(['.mp3','.flac','.m4a','.ogg','.wav','.ape','.aac','.opus']);
let completed = 0, total = 0;
const progress = () => parentPort.postMessage({ type: 'progress', completed, total });
async function walk(root, current, files) {
  for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, full, files);
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
}
async function run() {
  const groups = [], errors = [], items = [];
  for (const directory of workerData.directories) {
    const files = [];
    try { await walk(directory.path, directory.path, files); groups.push({directory, files}); total += files.length; }
    catch (error) { errors.push({ directory: directory.id, message: error.code || error.message });
      items.push(...workerData.previous.filter(item => item.directoryId === directory.id)); }
    progress();
  }
  for (const { directory, files } of groups) for (const full of files) {
    const relative = path.relative(directory.path, full).replace(/\\/g, '/');
    const filename = '@' + directory.id + '/' + relative;
    const existing = prior.get(filename), ext = path.extname(full).toLowerCase();
    try {
      const stat = await fs.promises.stat(full), lyric = full.slice(0, -ext.length) + '.lrc';
      const hasLyric = fs.existsSync(lyric);
      if (existing && existing.size === stat.size && existing.mtime === stat.mtimeMs && existing.hasLyric === hasLyric) items.push(existing);
      else {
        let tagger, metadata = {};
        try {
          tagger = new MusicTagger(); tagger.loadPath(full);
          metadata = { title: tagger.title, artist: tagger.artist, album: tagger.album, duration: tagger.duration,
            bitrate: tagger.bitRate, sampleRate: tagger.sampleRate, bitDepth: tagger.bitDepth,
            hasCover: Array.isArray(tagger.pictures) && tagger.pictures.some(pic => pic?.data?.length),
            hasEmbedLyric: !!tagger.lyrics };
        } catch {} finally { try { tagger?.dispose(); } catch {} }
        const lossless = ['.flac','.wav','.ape'].includes(ext);
        const quality = lossless ? ((metadata.bitDepth > 16 || metadata.sampleRate > 48000) ? 'flac24bit' : 'flac')
          : metadata.bitrate >= 240 ? '320k' : metadata.bitrate >= 170 ? '192k' : '128k';
        const fallback = path.basename(full, ext).split(' - ');
        const id = existing?.id || 'custom_' + crypto.createHash('md5').update(filename).digest('hex');
        const seconds = Math.round((metadata.duration || 0) / 1000);
        items.push({ ...existing, id, songmid: existing?.songmid || id, name: metadata.title || existing?.name || fallback[0],
          singer: metadata.artist || existing?.singer || fallback[1] || '未知歌手', album: metadata.album || existing?.album || '',
          interval: seconds ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0') : existing?.interval || '',
          source: existing?.source || 'custom', quality, filename, directoryId: directory.id, folder: 'custom',
          subPath: path.dirname(relative) === '.' ? '' : path.dirname(relative).replace(/\\/g, '/'),
          mtime: stat.mtimeMs, size: stat.size, ext: ext.slice(1), hasLyric, hasEmbedLyric: metadata.hasEmbedLyric,
          hasCover: metadata.hasCover || existing?.hasCover, coverType: metadata.hasCover ? 'embedded' : existing?.coverType || 'none',
          bitrate: metadata.bitrate, sampleRate: metadata.sampleRate, bitDepth: metadata.bitDepth });
      }
    } catch (error) { if (existing) items.push(existing); errors.push({ file: filename, message: error.code || error.message }); }
    completed++; if (completed % 20 === 0 || completed === total) progress();
  }
  parentPort.postMessage({ type: 'done', items, errors });
}
run().catch(error => { throw error; });
`
