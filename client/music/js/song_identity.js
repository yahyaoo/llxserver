/** 歌曲身份、文件身份与音质聚合；浏览器和服务端共用。 @author yahyaoo */
(function (root) {
    const text = value => value == null ? '' : String(value).trim();
    const info = item => ({ ...item?.songInfo, ...item?.song, ...item });
    const field = (item, key) => item[key] ?? item.meta?.[key] ?? item.songInfo?.[key] ?? item.song?.[key] ?? item.song?.meta?.[key];
    const filename = item => text(item.filename || item._localFilename || item.customFilename).replace(/\\/g, '/').replace(/^\.\//, '');
    const normalize = value => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')');
    /** 关联歌曲跨平台聚合，名称保留版本词；未关联文件仍按目录和路径区分。 */
    function key(item) {
        if (!item) return null;
        const song = info(item), source = text(field(song, 'source'));
        if (source && !['local', 'custom', 'unknown'].includes(source)) {
            const name = normalize(song.name || song.songname), singer = normalize(song.singer || song.singername);
            if (name && singer && !['未知歌手', 'unknown'].includes(singer)) return JSON.stringify(['recording', name, singer]);
            let id = text(field(song, 'songmid') || field(song, 'songId') || item.song?.id || song.id);
            if (id.startsWith(source + '_')) id = id.slice(source.length + 1);
            if (id && id !== 'undefined' && id !== 'null') return JSON.stringify(['song', id]);
        }
        return fileKey(song) || (song.id ? JSON.stringify(['local', source, text(song.id)]) : null);
    }
    /** 一个物理文件独立管理；不使用临时播放 URL 或歌曲名作为唯一标识。 */
    function fileKey(item) {
        const song = info(item), name = filename(song);
        if (song.serverDownloadId) return JSON.stringify(['download', text(song.serverDownloadId)]);
        if (!name) return null;
        return JSON.stringify(['file', text(song._localUsername || song.username), text(song.folder || song._localFolder || (song.isCustomDir || song._isCustomDir || song.isCustomFile || song.customFilename ? 'custom' : 'music')), text(song.location), name]);
    }
    const priorities = { '128k': 1, '192k': 2, '320k': 3, flac: 5, wav: 5, ape: 5, flac24bit: 6, hires: 7, atmos: 8, atmos_plus: 9, master: 10 };
    function rank(item) {
        const song = info(item), bits = Number(field(song, 'bitDepth') || field(song, 'bitsPerSample') || 0), rate = Number(field(song, 'sampleRate') || field(song, 'samplingRate') || 0);
        let quality = priorities[text(song.quality || song.type)] || 0;
        if (quality >= 5 && bits > 16) quality = Math.max(quality, rate > 48000 ? 7 : 6);
        return [quality, bits, rate, Number(field(song, 'bitrate') || 0), song.serverDownloadId || song.folder === 'download' ? 3 : song.folder === 'music' ? 2 : song.folder === 'custom' ? 1 : 0, Number(song.mtime || 0)];
    }
    function compare(a, b) {
        const left = rank(a), right = rank(b);
        for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
        return text(fileKey(a)).localeCompare(text(fileKey(b)));
    }
    /** 切换副本时清理上一位置的定位字段，避免缓存仍带着下载文件标识。 */
    function selectFile(song, file) {
        const result = { ...song };
        for (const field of ['serverDownloadId', 'filename', '_localFilename', '_localFolder', '_localUsername', '_isCustomDir', 'customFilename', 'isCustomFile', 'isCustomDir', 'location', 'root', 'url', 'folder', 'isLocal', '_localLibraryItem']) delete result[field];
        return { ...result, ...file };
    }
    /** 聚合只影响展示，不删除副本；所有文件保持各自的路径、音质和删除标识。 */
    function aggregate(items = []) {
        const groups = new Map();
        // 同一路径的旧索引可能带有不同关联信息，优先保留可识别的歌曲归属。
        const owners = new Map();
        const completeness = item => { const song = info(item); return (!['local', 'custom', 'unknown', ''].includes(text(song.source)) ? 4 : 0) + (song.name ? 1 : 0) + (song.singer && song.singer !== '未知歌手' ? 2 : 0); };
        for (const item of items) for (const file of item?.files?.length ? item.files : item ? [item] : []) {
            const id = fileKey(file);
            if (!id) continue;
            const prior = owners.get(id);
            if (!prior || completeness(file) > completeness(prior.file) || completeness(file) === completeness(prior.file) && compare(file, prior.file) < 0) owners.set(id, { file, identity: key(file) || key(item) });
        }
        items.forEach((item, index) => {
            if (!item) return;
            const values = item.files?.length ? item.files : [item];
            // 旧聚合行的某个文件重新关联后，分别归入其真实歌曲，避免遗留空副本行。
            const identities = new Set(values.map(value => owners.get(fileKey(value))?.identity).filter(Boolean));
            if (!identities.size) identities.add(key(item) || 'unidentified:' + index);
            for (const identity of identities) {
                let group = groups.get(identity);
                if (!group) { group = { items: [], files: new Map() }; groups.set(identity, group); }
                group.items.push(item);
                for (const value of values) {
                    const id = fileKey(value);
                    if (!id) continue;
                    if (owners.get(id)?.identity !== identity) continue;
                    const file = { ...owners.get(id).file }; delete file.files;
                    const prior = group.files.get(id);
                    if (!prior || compare(file, prior) < 0) group.files.set(id, { ...file, fileKey: id });
                }
            }
        });
        return [...groups].map(([identity, group]) => {
            const files = [...group.files.values()].sort(compare);
            const base = group.items.slice().sort(compare)[0];
            const chosen = files.find(file => file.fileKey === base._selectedFileKey) || files[0];
            const result = chosen ? selectFile(base, chosen) : { ...base };
            if (files.length) { result.files = files; result.libraryKey = identity; }
            if (group.items.some(item => item.playedAt != null)) {
                result.playedAt = Math.max(...group.items.map(item => Number(item.playedAt || 0)));
                result.playCount = Math.max(...group.items.map(item => Number(item.playCount || 0)));
            }
            return result;
        });
    }
    const api = { key, fileKey, aggregate, compare, info, selectFile };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SongIdentity = api;
})(typeof window === 'undefined' ? globalThis : window);
