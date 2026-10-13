/** 全部本地页面共享歌曲文件目录与版本选择。 @author yahyaoo */
(() => {
    let library = new Map(), owner = '', pending = null, pendingOwner = '', panel = null, loaded = false;
    const selected = new Map();
    const identity = () => { const auth = window.getUserAuthHeaders?.() || {}; return (auth['x-user-token'] || '') + ':' + (auth['x-user-name'] || ''); };
    function checkOwner() {
        if (owner === identity()) return;
        owner = identity(); library.clear(); selected.clear(); loaded = false; close();
    }
    function setLibrary(items) {
        checkOwner();
        const songs = window.SongIdentity.aggregate(items);
        library = new Map(songs.map(song => [window.SongIdentity.key(song), song]));
        loaded = true;
        return enrich(songs);
    }
    function enrich(items = []) {
        checkOwner();
        const result = window.SongIdentity.aggregate(items).map(song => {
            const key = window.SongIdentity.key(song), local = library.get(key);
            let result = local ? { ...song, ...local, playedAt: song.playedAt, playCount: song.playCount } : song;
            if (loaded && !local && !['local', 'custom', 'unknown'].includes(song.source) && song.files?.length) {
                result = window.SongIdentity.selectFile(song, {}); delete result.files; delete result.fileKey; delete result.libraryKey; delete result._selectedFileKey;
            }
            const file = result.files?.find(item => item.fileKey === selected.get(key));
            return file ? { ...window.SongIdentity.selectFile(result, file), files: result.files, _selectedFileKey: file.fileKey } : result;
        });
        return result;
    }
    async function refresh() {
        checkOwner();
        if (pending && pendingOwner === owner) return pending;
        const current = owner;
        pendingOwner = current;
        const request = fetch('/api/music/cache/list', { headers: window.getUserAuthHeaders?.(), cache: 'no-store' }).then(async response => {
            if (!response.ok) return;
            const data = await response.json();
            if (current !== identity()) return;
            setLibrary(data.data || []); window.dispatchEvent(new Event('song-files-updated'));
        }).catch(() => {}).finally(() => { if (pending === request) pending = null; });
        pending = request;
        return request;
    }
    /** 从推送目录选择可用版本，沿用统一音质顺序与认证 URL 构造。 */
    function findPlayable(song, quality, exactQuality, kind) {
        checkOwner();
        const item = library.get(window.SongIdentity.key(song));
        const candidates = (item?.files || []).filter(file => kind === 'download' ? file.folder === 'download' : file.folder !== 'download');
        const exact = candidates.find(file => file.quality === quality);
        const file = exact || (!exactQuality && candidates[0]);
        if (!file) return { exists: false };
        const selectedSong = window.MusicExperience.playable(window.SongIdentity.selectFile(item, file));
        return { exists: true, url: selectedSong.url, quality: file.quality, filename: file.filename, folder: file.folder, location: file.location, songInfo: selectedSong };
    }
    function close() { panel?.remove(); panel = null; }
    const locations = { cache: '播放缓存', music: '音乐目录', custom: '自定义目录', download: '服务器下载' };
    function open(button, song) {
        close();
        const item = enrich([song])[0], files = item?.files || [];
        if (!files.length) { window.showInfo?.('这首歌曲还没有本地文件'); return; }
        const rect = button.getBoundingClientRect();
        panel = document.createElement('section'); panel.className = 'song-files-popover'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '音质与文件');
        const heading = document.createElement('header'), title = document.createElement('strong'), dismiss = document.createElement('button');
        title.textContent = item.name + ' · ' + files.length + ' 个文件'; dismiss.type = 'button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', '关闭音质与文件'); dismiss.onclick = close;
        heading.append(title, dismiss); panel.append(heading);
        for (const file of files) {
            const row = document.createElement('div'); row.className = 'song-file-version';
            const play = document.createElement('button'); play.type = 'button'; play.className = 'song-file-choice';
            const active = window.SongIdentity.fileKey(item) === file.fileKey;
            play.setAttribute('aria-pressed', String(active));
            const name = document.createElement('strong'); name.textContent = (active ? '✓ ' : '') + (window.QualityManager?.getQualityDisplayName?.(file.quality) || file.quality || '原始音质');
            const details = document.createElement('small'); details.textContent = (locations[file.folder] || file.folder || '本地文件') + (file.location ? ' / ' + file.location : '') + ' · ' + ((file.size || 0) / 1048576).toFixed(1) + ' MB' + (file.bitDepth ? ' · ' + file.bitDepth + 'bit' : '') + (file.sampleRate ? ' · ' + (file.sampleRate / 1000) + 'kHz' : '');
            const path = document.createElement('small'); path.className = 'song-file-path'; path.textContent = file.filename || file._localFilename || ''; path.title = path.textContent;
            play.append(name, details, path);
            play.onclick = () => {
                selected.set(window.SongIdentity.key(item), file.fileKey);
                const version = { ...window.SongIdentity.selectFile(item, file), files, _selectedFileKey: file.fileKey };
                close(); window.playSongFileVersion?.(window.MusicExperience.playable(version));
                window.dispatchEvent(new Event('song-files-updated'));
            };
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'song-file-delete'; remove.title = '删除这个文件'; remove.setAttribute('aria-label', '删除 ' + (file.quality || '') + ' ' + (locations[file.folder] || '') + ' 文件'); remove.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
            if (file.folder === 'custom' && !window.userAllowOperateCustomDir) { remove.disabled = true; remove.title = '管理员未允许删除此目录的文件'; }
            remove.onclick = async () => { close(); await window.MusicMaintenance.start('delete', [file]); };
            row.append(play, remove); panel.append(row);
        }
        if (files.length > 1) {
            const removeAll = document.createElement('button'); removeAll.type = 'button'; removeAll.className = 'song-files-delete-all'; removeAll.textContent = '删除全部 ' + files.length + ' 个文件';
            if (files.some(file => file.folder === 'custom') && !window.userAllowOperateCustomDir) { removeAll.disabled = true; removeAll.title = '管理员未允许删除此目录的文件'; }
            removeAll.onclick = async () => { close(); await window.MusicMaintenance.start('delete', files); }; panel.append(removeAll);
        }
        document.body.append(panel);
        panel.style.left = Math.max(8, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8)) + 'px';
        panel.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - panel.offsetHeight - 8)) + 'px';
        panel.querySelector('.song-file-choice')?.focus({ preventScroll: true });
    }
    const menuEntry = (button, song) => ['音质与文件', 'fa-layer-group', () => open(button, song)];
    document.addEventListener('pointerdown', event => { if (panel && !panel.contains(event.target)) close(); }, true);
    document.addEventListener('keydown', event => { if (panel && event.key === 'Escape') { event.preventDefault(); close(); } });
    window.addEventListener('music-account-changed', () => { checkOwner(); refresh(); });
    window.addEventListener('song-files-updated', () => {
        const view = document.getElementById('view-search');
        if (view?.dataset.onlineSearch === 'false' && !view.classList.contains('hidden')) window.renderResults?.(window.viewingPlaylist);
        if (!document.getElementById('view-recent')?.classList.contains('hidden')) window.RecentView?.refreshFiles?.();
        if (!document.getElementById('queue-drawer')?.classList.contains('translate-x-full')) window.renderQueue?.();
    });
    window.SongFiles = { setLibrary, enrich, refresh, findPlayable, open, menuEntry, close };
    document.addEventListener('DOMContentLoaded', () => refresh());
})();
