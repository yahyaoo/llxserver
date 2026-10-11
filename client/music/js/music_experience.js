/** 主题、背景与账号最近播放的前端协调。 @author jingyh @date 2026-10-10 */
(() => {
    const defaults = { theme: 'pink', appearance: 'system', color: '#ec4899', opacity: 0.18, glassBlur: 60, recentLimit: 100, background: null };
    let value = { ...defaults }, account = null, authIdentity = null, revision = 0, saved = Promise.resolve(), recorded = Promise.resolve(), backgroundUrl = null;
    const root = document.documentElement;
    const accountName = () => window.getUserAuthHeaders?.()['x-user-name'] || '_open';
    const headers = () => ({ ...window.getUserAuthHeaders(), 'Content-Type': 'application/json' });
    const report = error => window.showError?.(error.message || '保存失败，请重试');
    const cacheKey = name => 'lx_experience:' + name;
    const blend = (hex, target, weight) => '#' + [1, 3, 5].map(offset => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * (1 - weight) + target * weight).toString(16).padStart(2, '0')).join('');

    /** 将所有本地文件转换为当前账号可认证的播放器 URL；不把令牌存入数据库。 */
    const playable = item => {
        const song = { ...item.songInfo, ...item };
        if (!item.filename) return song;
        const username = accountName();
        const token = window.getUserAuthHeaders()['x-user-token'];
        const custom = item.isCustomDir || item.folder === 'custom';
        const params = new URLSearchParams({ folder: item.folder || 'music' });
        if (token) params.set('token', token);
        song.url = `/api/music/${custom ? 'custom' : 'cache'}/file/${encodeURIComponent(username)}/${encodeURIComponent(item.filename)}?${params}`;
        const cover = coverUrl(item);
        const coverParams = cover?.startsWith('/api/') ? new URL(cover, location.origin) : null;
        if (coverParams && token) coverParams.searchParams.set('token', token);
        Object.assign(song, { id: item.id || item.songInfo?.id || item.filename, source: item.source || item.songInfo?.source || 'local', isLocal: true, pic: coverParams ? coverParams.pathname + coverParams.search : cover || '/music/assets/logo.svg', albumName: item.album || item.albumName || '', _localLibraryItem: true,
            _localFilename: item.filename, _localFolder: item.folder || 'cache', _localUsername: username, _isCustomDir: !!custom });
        // 未关联的平台标识是本地索引生成的占位，移除后原歌词流程会优先读取内嵌歌词。
        if (song.source === 'local') {
            delete song.songmid; delete song.songId;
            if (song.meta) { song.meta = { ...song.meta }; delete song.meta.songmid; delete song.meta.songId; }
        }
        return song;
    };
    /** 所有歌曲列表和播放器共用候选顺序：本地文件、歌曲字段、当前账号已有歌单。 */
    const coverCandidates = item => {
        if (!item) return [];
        const song = { ...item.songInfo, ...item }, candidates = [];
        const add = value => {
            if (typeof value !== 'string' || !/^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(value) || value.includes('/assets/logo.svg')) return;
            if (value.startsWith('/api/music/')) {
                const url = new URL(value, location.origin), auth = window.getUserAuthHeaders?.() || {};
                url.searchParams.delete('password'); url.searchParams.delete('auth'); url.searchParams.delete('token');
                url.searchParams.set('user', accountName());
                if (auth['x-user-token']) url.searchParams.set('token', auth['x-user-token']);
                value = url.pathname + url.search;
            }
            if (!candidates.includes(value)) candidates.push(value);
        };
        const fields = value => {
            for (const url of [value.meta?.picUrl, value.img, value.pic, value.picUrl, value.picture, value.meta?.img, value.meta?.pic, value.meta?.albumPic, value.meta?.cover, value.album?.picUrl, value.album?.img, value.album?.pic, value.album?.cover, value.al?.picUrl, value.al?.img, value.otherSource?.meta?.picUrl]) add(url);
        };
        const filename = song.filename || song._localFilename;
        if (filename) {
            const folder = song.folder || song._localFolder || 'music';
            const params = new URLSearchParams({ filename, user: accountName(), folder, v: String(song.mtime || '') });
            add(`/api/music/${song.isCustomDir || song._isCustomDir || folder === 'custom' ? 'custom' : 'cache'}/cover?${params}`);
        }
        fields(song);
        // 旧历史丢失封面时按平台和歌曲标识补齐；不读取页面 DOM，也不跨账号取数据。
        const data = window.myPersonalListData || window.currentListData;
        if (song.id != null && song.source && data) {
            const lists = [data.loveList, data.defaultList, ...(data.userList || []).map(list => list.list)];
            for (const list of lists) {
                const match = list?.find(value => String(value.id) === String(song.id) && value.source === song.source);
                if (match) fields(match);
            }
        }
        const remote = candidates.filter(url => /^https?:\/\//.test(url));
        if (song.source && song.id != null && (remote.length || song.artworkCached || song.artworkUrl)) {
            const params = new URLSearchParams({ source: song.source, id: String(song.id), user: accountName() });
            for (const url of remote.slice(0, 8)) params.append('url', url);
            const auth = window.getUserAuthHeaders?.() || {};
            if (auth['x-user-token']) params.set('token', auth['x-user-token']);
            candidates.splice(filename ? 1 : 0, 0, '/api/music/artwork?' + params);
        }
        return candidates;
    };
    const coverUrl = item => coverCandidates(item)[0] || null;
    /** 保存和下载元数据优先保留音源地址；运行时认证参数不进入歌单或任务文档。 */
    const coverReference = item => {
        const candidates = coverCandidates(item);
        const value = candidates.find(url => /^https?:\/\//.test(url)) || candidates[0];
        if (!value) return null;
        if (!value.startsWith('/api/music/')) return value;
        const url = new URL(value, location.origin);
        for (const key of ['token', 'password', 'auth']) url.searchParams.delete(key);
        return url.pathname + url.search;
    };

    /** 应用外观；颜色和透明度共用 CSS 变量，背景图片只由认证请求获取。 */
    function apply() {
        setTheme(value.theme, false); setAppearance(value.appearance, false);
        const custom = value.theme === 'custom' || !['pink', 'emerald', 'blue', 'amber', 'violet', 'rose', 'white', 'black'].includes(value.theme);
        const color = value.theme === 'custom' ? value.color : window.ThemeControls.colors.find(item => item[0] === value.theme)?.[2] || '#ec4899';
        for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
            if (custom) root.style.setProperty('--c-' + shade, shade < 500 ? blend(color, 255, (500 - shade) / 500) : blend(color, 0, (shade - 500) / 650));
            else root.style.removeProperty('--c-' + shade);
        }
        // 透明度只作用于背景，不能降低文字和按钮的不透明度；0% 模糊不保留固定滤镜。
        root.style.setProperty('--surface-opacity', 1 - value.opacity);
        root.style.setProperty('--surface-blur', value.glassBlur * 0.4 + 'px');
        root.classList.add('music-appearance');
        root.style.setProperty('--background-x', (value.background?.x ?? 50) + '%');
        root.style.setProperty('--background-y', (value.background?.y ?? 50) + '%');
        root.style.setProperty('--background-blur', (value.background?.blur ?? 0) + 'px');
        root.classList.toggle('has-music-background', !!value.background);
        const preview = document.getElementById('theme-background-preview');
        if (preview) { preview.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : ''; preview.classList.toggle('has-image', !!value.background); }
        if (!value.background) { root.style.removeProperty('--music-background'); if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); backgroundUrl = null; }
        document.querySelectorAll('[data-experience-control]').forEach(control => {
            const key = control.dataset.experienceControl;
            const current = key === 'blur' || key === 'x' || key === 'y' ? value.background?.[key] ?? (key === 'blur' ? 0 : 50) : value[key];
            control.value = current;
            const label = control.parentElement.querySelector('output'); if (label) label.value = key === 'opacity' ? Math.round(current * 100) + '%' : key === 'glassBlur' ? current + '%' : current;
        });
    }

    async function loadBackground(requestRevision, auth) {
        if (!value.background) return;
        const owner = accountName(), file = value.background.file;
        const isCurrent = () => owner === accountName() && value.background?.file === file;
        const response = await fetch('/api/user/appearance/background', { headers: auth });
        if (!isCurrent()) return;
        if (!response.ok) { if (response.status === 404) { value = { ...value, theme: 'pink', color: '#ec4899', background: null }; apply(); } else throw new Error('背景加载失败'); return; }
        const blob = await response.blob();
        if (!isCurrent()) return;
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
        backgroundUrl = URL.createObjectURL(blob);
        root.style.setProperty('--music-background', `url("${backgroundUrl}")`); apply();
    }

    window.MusicExperience = {
        get account() { return account; },
        get value() { return { ...value }; },
        playable, coverUrl, coverCandidates, coverReference,
        playItem(item) { const song = playable(item); window.updatePlaylist([song], 0, 'local_all', false); },
        openCollection(name, items) { window.switchTab('recent', false); window.RecentView.show(name, items); },
        async accountChanged() {
            const next = accountName();
            const identity = next + ':' + (window.getUserAuthHeaders()['x-user-token'] || '');
            if (identity === authIdentity) return;
            const changedAccount = next !== account;
            authIdentity = identity;
            account = next; const requestRevision = ++revision;
            if (changedAccount) window.dispatchEvent(new Event('music-account-changed'));
            // 本地缓存按账号分开；数据库配置是最终来源。
            try { value = { ...defaults, ...(JSON.parse(localStorage.getItem(cacheKey(next))) || {}) }; } catch { value = { ...defaults }; }
            value.background = null; apply();
            const auth = headers();
            try {
                const response = await fetch('/api/user/appearance', { headers: auth });
                if (!response.ok) throw new Error('账号外观配置加载失败');
                const remote = await response.json();
                if (requestRevision !== revision) return;
                value = { ...defaults, ...remote }; localStorage.setItem(cacheKey(next), JSON.stringify(value)); apply();
                await loadBackground(requestRevision, auth);
            } catch (error) { if (requestRevision === revision) report(error); }
            if (!document.getElementById('view-recent').classList.contains('hidden')) window.RecentView.load();
        },
        change(patch) {
            const requestRevision = ++revision;
            value = { ...value, ...patch }; apply();
            const snapshot = { ...value }, owner = accountName(), auth = headers();
            localStorage.setItem(cacheKey(owner), JSON.stringify(snapshot));
            saved = saved.catch(() => {}).then(async () => {
                const response = await fetch('/api/user/appearance', { method: 'PUT', headers: auth, body: JSON.stringify(snapshot) });
                if (!response.ok) throw new Error((await response.json()).message || '配置保存失败');
                const normalized = await response.json();
                // 服务端可能返回部分字段；保留本次配置，避免旧版本响应清空滑块数值。
                if (owner === accountName() && requestRevision === revision) { value = { ...defaults, ...snapshot, ...normalized }; localStorage.setItem(cacheKey(owner), JSON.stringify(value)); apply(); }
            }).catch(error => { if (owner === accountName()) report(error); });
            return saved;
        },
        async upload(file) {
            if (!file) return;
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) { report(new Error('请选择不超过 10 MB 的 PNG、JPEG、WebP 或 GIF 图片')); return; }
            const owner = accountName(), auth = window.getUserAuthHeaders(), requestRevision = ++revision;
            try {
                const response = await fetch('/api/user/appearance/background', { method: 'POST', headers: auth, body: file });
                const data = await response.json(); if (!response.ok) throw new Error(data.message);
                if (owner !== accountName() || requestRevision !== revision) return;
                if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
                backgroundUrl = URL.createObjectURL(file); root.style.setProperty('--music-background', `url("${backgroundUrl}")`);
                await this.change({ background: { file: data.file, x: 50, y: 50, blur: 0 } });
            } catch (error) { report(error); }
        },
        record(song, quality, playback) {
            const owner = accountName(), auth = headers();
            const data = { ...song, quality, ...playback };
            // 本地播放路径上的实际文件名补入历史，重启后仍可重建认证 URL。
            if (song.isLocal && song.url) { const parsed = new URL(song.url, location.origin); const match = parsed.pathname.match(/\/api\/music\/(cache|custom)\/file\/[^/]+\/(.+)/); if (match) { data.filename = decodeURIComponent(match[2]); data.folder = parsed.searchParams.get('folder') || 'music'; data.isCustomDir = match[1] === 'custom'; } }
            recorded = recorded.catch(() => {}).then(() => fetch('/api/user/recent', { method: 'POST', headers: auth, body: JSON.stringify(data) })).then(response => {
                if (!response.ok) throw new Error('最近播放记录保存失败');
                if (owner === accountName() && !document.getElementById('view-recent').classList.contains('hidden')) window.RecentView.load();
            }).catch(report);
            return recorded;
        },
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-theme-controls]').forEach(container => window.ThemeControls.mount(container));
        document.querySelectorAll('[data-experience-control]').forEach(control => {
            control.addEventListener('input', () => {
                const key = control.dataset.experienceControl;
                if (['x', 'y', 'blur'].includes(key)) { if (value.background) value = { ...value, background: { ...value.background, [key]: Number(control.value) } }; }
                else value = { ...value, [key]: key === 'color' ? control.value : Number(control.value), ...(key === 'color' ? { theme: 'custom' } : {}) };
                apply();
            });
            control.addEventListener('change', () => window.MusicExperience.change(value));
        });
        document.getElementById('theme-image-upload').addEventListener('change', event => { window.MusicExperience.upload(event.target.files[0]); event.target.value = ''; });
        const preview = document.getElementById('theme-background-preview');
        let dragging;
        preview.addEventListener('pointerdown', event => { if (!value.background) return; dragging = { x: event.clientX, y: event.clientY, start: { ...value.background } }; preview.setPointerCapture(event.pointerId); });
        preview.addEventListener('pointermove', event => { if (!dragging || !value.background) return; value = { ...value, background: { ...value.background, x: Math.max(0, Math.min(100, dragging.start.x - (event.clientX - dragging.x) / preview.clientWidth * 100)), y: Math.max(0, Math.min(100, dragging.start.y - (event.clientY - dragging.y) / preview.clientHeight * 100)) } }; apply(); });
        const endDrag = () => { if (dragging) { dragging = null; window.MusicExperience.change(value); } }; preview.addEventListener('pointerup', endDrag); preview.addEventListener('pointercancel', endDrag);
        window.MusicExperience.accountChanged();
    });
})();
