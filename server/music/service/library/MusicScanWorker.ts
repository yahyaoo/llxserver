/** 工作线程内遍历目录和读取原生标签，避免大量文件阻塞 HTTP 主线程。 */
export const musicScanWorker = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { MusicTagger } = require(workerData.taggerModule);
const prior = new Map(workerData.previous.map(item => [item.filename, item]));
const priorFolders = new Map(), knownChildren = new Map();
for (const item of prior.values()) { const key=item.directoryId + '/' + (item.subPath || ''); if(!priorFolders.has(key))priorFolders.set(key,[]);priorFolders.get(key).push(item); }
const extensions = new Set(['.mp3','.flac','.m4a','.ogg','.wav','.ape','.aac','.opus']);
let completed = 0, total = 0;
const mode = workerData.mode || 'full', folders = {}, stats = { directoryStat: 0, readdir: 0, fileStat: 0, tags: 0 };
const forceFiles = new Set(), deletedFolders = new Map();
const progress = () => parentPort.postMessage({ type: 'progress', completed, total });
async function walk(root, current, files, directory, oldFolders, targeted = false) {
  const relative = path.relative(root, current).replace(/\\/g, '/');
  const stat = await fs.promises.lstat(current); stats.directoryStat++;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('unsafe directory');
  folders[directory.id][relative] = stat.mtimeMs;
  if (mode === 'quick' && oldFolders[relative] === stat.mtimeMs) {
    for (const item of priorFolders.get(directory.id + '/' + relative) || []) files.push({ full: path.join(root, item.filename.split('/').slice(1).join('/')), reuse: true });
    for (const known of knownChildren.get(directory.id + '/' + relative) || []) {
        try { await walk(root, path.join(root, known), files, directory, oldFolders); }
        catch (error) {
          // Even ENOENT requires a successful parent enumeration before accepting deletion.
          const entries = await fs.promises.readdir(current, { withFileTypes: true }); stats.readdir++;
          if (error.code !== 'ENOENT' || entries.some(entry => entry.name === path.basename(known))) throw error;
        }
    }
    return;
  }
  const entries = await fs.promises.readdir(current, { withFileTypes: true }); stats.readdir++;
  if (targeted) {
    const missing = Object.keys(oldFolders).filter(known => known && path.posix.dirname(known) === (relative || '.') && !entries.some(entry => entry.isDirectory() && entry.name === path.posix.basename(known)));
    if (!deletedFolders.has(directory.id)) deletedFolders.set(directory.id,new Set());
    for (const known of missing) { deletedFolders.get(directory.id).add(known); for (const key of Object.keys(folders[directory.id])) if (key === known || key.startsWith(known + '/')) delete folders[directory.id][key]; }
  }
  const lyrics = new Set(entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.lrc')).map(entry => entry.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!targeted || oldFolders[path.relative(root, full).replace(/\\/g, '/')] === undefined) await walk(root, full, files, directory, oldFolders);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push({ full, hasLyric: lyrics.has(entry.name.slice(0, -path.extname(entry.name).length) + '.lrc') });
  }
}
async function run() {
  const selected = new Set(workerData.directories.map(directory => directory.id));
  const groups = [], errors = [], items = workerData.previous.filter(item => !selected.has(item.directoryId));
  for (const directory of workerData.directories) {
    const files = [], oldFolders = workerData.folders?.[directory.id] || {};
    for (const known of Object.keys(oldFolders)) if(known){ const parent=path.posix.dirname(known),key=directory.id + '/' + (parent==='.'?'':parent);if(!knownChildren.has(key))knownChildren.set(key,[]);knownChildren.get(key).push(known); }
    folders[directory.id] = mode === 'paths' ? { ...oldFolders } : {};
    try {
      const root = await fs.promises.realpath(directory.path);
      if (mode !== 'paths') await walk(root, root, files, directory, oldFolders);
      else {
        const targets = [...new Set((workerData.paths?.[directory.id] || []).map(value => {
          if (typeof value !== 'string' || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw Error('unsafe dirty path');
          return value.replace(/\\/g, '/');
        }))];
        const affected = new Set();
        for (const value of targets) {
          let full = path.resolve(root, value), relative = path.relative(root, full);
          if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('unsafe dirty path');
          let stat; try { stat = await fs.promises.lstat(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (stat?.isSymbolicLink()) throw Error('unsafe dirty link');
          const parent = stat?.isDirectory() ? full : path.dirname(full);
          const real = await fs.promises.realpath(parent);
          if (real !== root && !real.startsWith(root + path.sep)) throw Error('unsafe dirty parent');
          affected.add(real);
          // Every explicit dirty hint refreshes metadata, including sidecar changes.
          forceFiles.add(path.basename(full, path.extname(full)));
        }
        for (const current of affected) await walk(root, current, files, directory, oldFolders, true);
        const touched = new Set([...affected].map(current => path.relative(root, current).replace(/\\/g, '/')));
        items.push(...workerData.previous.filter(item => item.directoryId === directory.id && !touched.has(item.subPath || '') && ![...(deletedFolders.get(directory.id) || [])].some(folder => item.subPath === folder || (item.subPath || '').startsWith(folder + '/'))));
      }
      // An unexpectedly empty configured root may be a disconnected mount. Preserve until a trusted nonempty scan.
      if (!files.length && mode !== 'paths' && workerData.previous.some(item => item.directoryId === directory.id)) throw Error('EMPTY_ROOT: 保留旧索引，请确认挂载状态');
      groups.push({directory, files}); total += files.length;
    }
    catch (error) { errors.push({ directory: directory.id, message: error.code || error.message });
      items.push(...workerData.previous.filter(item => item.directoryId === directory.id)); }
    progress();
  }
  for (const { directory, files } of groups) for (const candidate of files) {
    const full = candidate.full;
    const relative = path.relative(directory.path, full).replace(/\\/g, '/');
    const filename = '@' + directory.id + '/' + relative;
    const existing = prior.get(filename), ext = path.extname(full).toLowerCase();
    try {
      if (candidate.reuse && existing) { items.push(existing); completed++; continue; }
      const stat = await fs.promises.lstat(full); stats.fileStat++;
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('unsafe audio file');
      const hasLyric = candidate.hasLyric;
      const lyric = full.slice(0, -ext.length) + '.lrc';
      let lyricVersion = '';
      if (hasLyric) { const sidecar = await fs.promises.lstat(lyric); if (sidecar.isSymbolicLink()) throw Error('unsafe lyric link'); lyricVersion = sidecar.size + ':' + sidecar.mtimeMs; }
      if (existing && !existing.metadataPending && !forceFiles.has(path.basename(full, ext)) && existing.size === stat.size && existing.mtime === stat.mtimeMs && existing.hasLyric === hasLyric && (existing.lyricVersion || '') === lyricVersion && typeof existing.hasCover === 'boolean') items.push(existing);
      else {
        let tagger, metadata = {}, metadataPending = false;
        try {
          tagger = new MusicTagger(); tagger.loadPath(full); stats.tags++;
          metadata = { title: tagger.title, artist: tagger.artist, album: tagger.album, duration: tagger.duration,
            bitrate: tagger.bitRate, sampleRate: tagger.sampleRate, bitDepth: tagger.bitDepth,
            hasCover: Array.isArray(tagger.pictures) && tagger.pictures.some(pic => pic?.data?.length),
            hasEmbedLyric: !!tagger.lyrics };
        } catch (error) {
          metadataPending = true;
          const code = error?.code ? String(error.code) : '';
          const detail = error?.message ? String(error.message) : '无法读取音频标签';
          errors.push({ file: filename, code: code || undefined, message: 'TAG_READ: ' + (code ? code + ': ' : '') + detail });
        } finally { try { tagger?.dispose(); } catch {} }
        if (metadataPending) {
          if (existing) items.push({ ...existing, metadataPending: true });
          completed++;
          continue;
        }
        const after = await fs.promises.stat(full);
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('BUSY: 文件读取时发生变化');
        if (workerData.ioPauseMs > 0) await new Promise(resolve => setTimeout(resolve, workerData.ioPauseMs));
        const lossless = ['.flac','.wav','.ape'].includes(ext);
        const quality = lossless ? ((metadata.bitDepth > 16 || metadata.sampleRate > 48000) ? 'flac24bit' : 'flac')
          : metadata.bitrate >= 240 ? '320k' : metadata.bitrate >= 170 ? '192k' : '128k';
        const baseName = path.basename(full, ext), standard = baseName.split('_-_');
        const fallback = baseName.split(' - ');
        const standardSource = standard.length >= 5 ? standard[2] : '';
        const standardId = standardSource ? (standard[3].startsWith(standardSource + '_') ? standard[3] : standardSource + '_' + standard[3]) : '';
        const id = existing?.id || standardId || 'custom_' + crypto.createHash('md5').update(filename).digest('hex');
        const seconds = Math.round((metadata.duration || 0) / 1000);
        items.push({ ...existing, id, songmid: existing?.songmid || id, name: metadata.title || existing?.name || (standardSource ? standard[0] : fallback[0]),
          singer: metadata.artist || existing?.singer || (standardSource ? standard[1] : fallback[1]) || '未知歌手', album: metadata.album || existing?.album || '',
          interval: seconds ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0') : existing?.interval || '',
          source: existing?.source || standardSource || 'custom', quality, filename, directoryId: directory.id, folder: 'custom',
          subPath: path.dirname(relative) === '.' ? '' : path.dirname(relative).replace(/\\/g, '/'),
          mtime: stat.mtimeMs, size: stat.size, metadataPending, ext: ext.slice(1), hasLyric, lyricVersion, hasEmbedLyric: metadata.hasEmbedLyric,
          hasCover: !!(metadata.hasCover || existing?.hasCover), coverType: metadata.hasCover ? 'embedded' : existing?.coverType || 'none',
          bitrate: metadata.bitrate, sampleRate: metadata.sampleRate, bitDepth: metadata.bitDepth });
      }
    } catch (error) {
      if (existing) items.push(existing);
      const code = error?.code ? String(error.code) : '';
      const detail = error?.message ? String(error.message) : '文件读取失败';
      errors.push({ file: filename, code: code || undefined, message: code ? code + ': ' + detail : detail });
    }
    completed++; if (completed % 20 === 0 || completed === total) progress();
    if (completed % 200 === 0) await new Promise(resolve => setImmediate(resolve));
  }
  const next = new Map(items.map(item => [item.filename,item]));
  const added = items.filter(item => !prior.has(item.filename)).map(item => item.filename);
  const changed = items.filter(item => prior.has(item.filename) && JSON.stringify(prior.get(item.filename)) !== JSON.stringify(item)).map(item => item.filename);
  const removed = [...prior.keys()].filter(filename => !next.has(filename));
  const changedKeys = new Set([...added,...changed]), unchanged = items.filter(item => !changedKeys.has(item.filename)).map(item => item.filename);
  parentPort.postMessage({ type: 'done', items: workerData.compact ? items.filter(item => changedKeys.has(item.filename)) : items, unchanged, errors, folders, added, changed, removed, stats });
}
run().catch(error => { throw error; });
`
