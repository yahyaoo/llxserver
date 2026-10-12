/** 维护任务、更多菜单、跨页面进度和滚动工具栏。 @author yahyaoo @date 2026-10-12 */
(() => {
    const labels = { lyrics: '补全歌词', embed: '嵌入歌词', metadata: '补全元信息', delete: '删除文件' };
    let tasks = [], scan = null, owner = '', timer = null, polling = false, closeMenu = null;
    const completed = new Set();
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const headers = (publicLibrary = false) => ({ ...window.getUserAuthHeaders?.(), ...(publicLibrary ? { 'x-user-name': '_open' } : {}) });
    const viewingPublic = () => !document.getElementById('view-localmusic')?.classList.contains('hidden') && window.LocalMusicManager?.isViewingPublicSongs;
    const account = () => headers()['x-user-token'] || (localStorage.getItem('lx_admin_password') ? 'admin' : '');
    const libraryManager = () => window.CustomDirManager?.isActive ? window.CustomDirManager : window.LocalMusicManager;
    const downloadSong = task => ({ ...task.song, quality: task.quality || task.song.quality, ...(task.serverDownload ? { folder: 'download' } : {}) });
    function songsFor(view) {
        if (view.id === 'view-localmusic') return libraryManager().originalData.map(song => window.CustomDirManager?.isActive ? { ...song, folder: 'custom' } : song);
        if (view.id === 'view-recent') return window.RecentView.getEntries();
        if (view.id === 'view-downloads') return window.SystemDownloadManager.tasks.filter(task => task.isServer && ['finished', 'exists'].includes(task.status)).map(downloadSong);
        return (window.viewingPlaylist || []).filter(song => song && (song.songmid || song.meta?.songmid || song.name && song.singer));
    }
    function progress(host) {
        const active = tasks.filter(task => task.status === 'running');
        const values = scan?.status === 'running' ? [{ ...scan, action: 'scan' }, ...active] : active;
        host.replaceChildren(); host.hidden = !values.length;
        for (const task of values) {
            const row = document.createElement('div'); row.className = 'music-task-progress';
            const text = document.createElement('span');
            text.textContent = `${task.action === 'scan' ? '扫描目录' : labels[task.action]} ${task.percent}% · ${task.completed}/${task.total}` + (task.failed ? ` · 失败 ${task.failed}` : '') + (task.status === 'error' ? ` · ${task.errors?.[0] || '任务失败'}` : '');
            const bar = document.createElement('progress'); bar.max = 100; bar.value = task.percent || 0; bar.setAttribute('aria-label', text.textContent);
            row.append(text, bar); host.append(row);
        }
    }
    function renderProgress() { document.querySelectorAll('.music-task-host').forEach(progress); }
    async function poll() {
        if (polling) return;
        const current = account();
        if (current !== owner) { owner = current; tasks = []; scan = null; completed.clear(); window.Roaming?.reset(); renderProgress(); if (current && localStorage.getItem('lx_play_mode') === 'roaming') window.Roaming?.refresh().catch(() => {}); }
        if (!window.isUserLoggedIn?.() && !localStorage.getItem('lx_admin_password')) return;
        polling = true;
        try {
            const response = await fetch('/api/music/maintenance', { headers: headers(), cache: 'no-store' });
            if (!response.ok || current !== account()) return;
            tasks = (await response.json()).tasks;
            if (localStorage.getItem('lx_admin_password')) {
                const publicResponse = await fetch('/api/music/maintenance', { headers: headers(true), cache: 'no-store' });
                if (publicResponse.ok && current === account()) {
                    const publicTasks = (await publicResponse.json()).tasks;
                    tasks = [...new Map([...tasks, ...publicTasks].map(task => [task.id, task])).values()];
                }
            }
            for (const task of tasks) if (task.status !== 'running' && !completed.has(task.id)) {
                completed.add(task.id);
                const notify = task.status === 'error' ? window.showError : window.showInfo;
                notify?.(`${labels[task.action]}${task.status === 'error' ? '失败' : '完成'}：成功 ${task.succeeded}，跳过 ${task.skipped}，失败 ${task.failed}${task.errors?.[0] ? '（' + task.errors[0] + '）' : ''}`);
                window.LocalMusicManager?.fetchData(true); window.SystemDownloadManager?.syncServerQueue(true);
                if (window.CustomDirManager?.isActive) window.CustomDirManager.fetchData(true);
            }
            const responseScan = await fetch('/api/music/library/scan', { headers: headers(), cache: 'no-store' });
            if (responseScan.ok && current === account()) scan = (await responseScan.json()).scan;
            if (localStorage.getItem('lx_admin_password')) {
                const publicScan = await fetch('/api/music/library/scan', { headers: headers(true), cache: 'no-store' });
                if (publicScan.ok && current === account()) { const value = (await publicScan.json()).scan; if (value?.status === 'running') scan = value; }
            }
            renderProgress();
        } catch {} finally { polling = false; }
    }
    async function start(action, songs, all = false, confirmed = false) {
        if (action === 'delete' && !confirmed && !await window.showSelect('删除本地文件', `确定删除 ${songs.length} 个文件吗？文件删除后无法恢复。`, { danger: true })) return;
        try {
            const response = await fetch('/api/music/maintenance', { method: 'POST', headers: { ...headers(viewingPublic()), 'Content-Type': 'application/json' }, body: JSON.stringify(all ? { action, scope: 'all' } : { action, songs }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || '任务启动失败');
            tasks = tasks.filter(task => task.action !== action).concat(data.task); renderProgress();
            window.showInfo?.(`${labels[action]}已在后台开始`); await poll();
        } catch (error) { window.showError?.(error.message); }
    }
    /** 菜单挂到 body，避免被歌曲行或过滤面板裁切。 */
    function menu(button, entries) {
        closeMenu?.();
        const host = document.createElement('div'); host.className = 'music-tools-menu'; host.setAttribute('role', 'menu');
        entries.forEach(([label, icon, action]) => {
            const item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'menuitem');
            item.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${escape(label)}</span>`;
            item.onclick = async event => { event.stopPropagation(); closeMenu?.(); await action(); }; host.append(item);
        });
        document.body.append(host); const box = button.getBoundingClientRect();
        host.style.left = Math.max(8, Math.min(innerWidth - host.offsetWidth - 8, box.right - host.offsetWidth)) + 'px';
        host.style.top = Math.max(8, Math.min(innerHeight - host.offsetHeight - 8, box.bottom + 5)) + 'px';
        host.firstElementChild?.focus();
        const close = event => { if (!host.contains(event.target)) cleanup(); };
        const listenerTimer = setTimeout(() => document.addEventListener('pointerdown', close, true));
        function cleanup() { clearTimeout(listenerTimer); host.remove(); document.removeEventListener('pointerdown', close, true); closeMenu = null; }
        closeMenu = cleanup;
        host.onkeydown = event => { if (event.key === 'Escape') { cleanup(); button.focus(); } };
    }
    const maintenanceEntries = songs => [['补全歌词', 'fa-closed-captioning', () => start('lyrics', songs)], ['嵌入歌词', 'fa-file-audio', () => start('embed', songs)], ['补全元信息', 'fa-tags', () => start('metadata', songs)]];
    function rowMenu(button, index) {
        const manager = libraryManager(), item = { ...manager.displayData[index], ...(window.CustomDirManager?.isActive ? { folder: 'custom' } : {}) };
        const entries = [['下载', 'fa-download', () => manager.downloadSingle(index)], ['添加到歌单', 'fa-plus', () => manager.addItemToPlaylist(index)], ...maintenanceEntries([item])];
        if (item.folder !== 'custom' || window.userAllowOperateCustomDir) entries.push(['删除', 'fa-trash-alt', () => start('delete', [item])]);
        menu(button, entries);
    }
    function more(button, view) {
        const songs = songsFor(view), library = view.id === 'view-localmusic';
        const entries = library ? [['扫描目录', 'fa-sync-alt', () => window.LocalMusicManager.refresh()], ...Object.entries(labels).filter(([action]) => action !== 'delete').map(([action, label]) => [label, action === 'lyrics' ? 'fa-closed-captioning' : action === 'embed' ? 'fa-file-audio' : 'fa-tags', () => start(action, [], true)]), ['批量操作', 'fa-tasks', () => window.LocalMusicManager.toggleBatchMode()]] : maintenanceEntries(songs);
        menu(button, entries);
    }
    const tools = new Map(); let docked = null;
    const slot = document.createElement('div'); slot.className = 'page-tools-dock'; slot.hidden = true;
    document.getElementById('music-top-bar')?.prepend(slot);
    function restore() {
        if (!docked) return;
        if (docked.marker.isConnected) { docked.marker.after(docked.bar); docked.heading.style.minHeight = docked.minHeight; } else docked.bar.remove();
        docked = null; slot.hidden = true; document.getElementById('music-top-bar')?.classList.remove('tools-docked');
    }
    function syncDock() {
        const visible = [...tools.values()].find(tool => !tool.view.classList.contains('hidden') && (tool.view.id !== 'view-search' || tool.view.dataset.onlineSearch !== 'true'));
        const scrollTop = visible ? Math.max(visible.view.scrollTop, visible.view.id === 'view-search' ? document.getElementById('search-results')?.scrollTop || 0 : 0) : 0;
        if (!visible || scrollTop < visible.threshold || innerWidth < 960) { restore(); return; }
        if (docked === visible) return;
        restore(); docked = visible; visible.heading.style.minHeight = visible.heading.getBoundingClientRect().height + 'px'; slot.append(visible.bar); slot.hidden = false;
        document.getElementById('music-top-bar')?.classList.add('tools-docked');
    }
    function mount(view, heading) {
        if (!view || !heading || heading.querySelector('.music-page-controls') || tools.has(heading)) return;
        const bar = document.createElement('div'); bar.className = 'music-page-controls';
        const roam = document.createElement('button'); roam.type = 'button'; roam.innerHTML = '<i class="fas fa-heart"></i><span>漫游播放</span>';
        roam.onclick = () => window.Roaming.start(songsFor(view));
        if (!['view-downloads'].includes(view.id) && window.currentViewingListId !== 'dislike_songs') bar.append(roam);
        if (view.id === 'view-localmusic') {
            const filter = document.createElement('button'); filter.type = 'button'; filter.id = 'lm-filter-toggle-btn'; filter.setAttribute('aria-expanded', 'false'); filter.innerHTML = '<i class="fas fa-filter"></i><span>筛选</span>'; filter.onclick = () => window.LocalMusicManager.toggleFilterPanel();
            const refresh = document.createElement('button'); refresh.type = 'button'; refresh.innerHTML = '<i class="fas fa-sync-alt"></i><span>刷新</span>'; refresh.onclick = () => window.LocalMusicManager.refresh();
            bar.append(filter, refresh);
            const smart = document.createElement('button'); smart.type = 'button'; smart.innerHTML = '<i class="fas fa-magic"></i><span>智能检测</span>'; smart.onclick = () => window.LocalMusicManager.autoLinkAll();
            const link = document.createElement('button'); link.type = 'button'; link.id = 'lm-remap-toggle-btn'; link.innerHTML = '<i class="fas fa-link"></i><span>重新关联</span>'; link.onclick = () => window.LocalMusicManager.toggleReMapping();
            bar.append(smart, link);
        }
        const original = view.querySelector('.recent-view-actions,.downloads-toolbar');
        if (original) { [...original.children].forEach(button => bar.append(button)); original.hidden = true; }
        const extra = document.createElement('button'); extra.type = 'button'; extra.setAttribute('aria-label', '更多'); extra.innerHTML = '<i class="fas fa-ellipsis-h"></i><span>更多</span>'; extra.onclick = () => more(extra, view); bar.append(extra);
        const marker = document.createElement('span'); marker.className = 'page-tools-marker'; heading.append(marker, bar);
        const taskHost = document.createElement('div'); taskHost.className = 'music-task-host'; heading.after(taskHost); progress(taskHost);
        tools.set(heading, { view, bar, marker, heading, minHeight: heading.style.minHeight, threshold: Math.max(50, heading.offsetTop - 20) });
    }
    function refreshTools() {
        for (const [heading, tool] of tools) if (!heading.isConnected) { if (docked === tool) restore(); tools.delete(heading); }
        mount(document.getElementById('view-localmusic'), document.getElementById('lm-toolbar'));
        mount(document.getElementById('view-recent'), document.querySelector('#view-recent .recent-view-header'));
        mount(document.getElementById('view-downloads'), document.querySelector('#view-downloads .downloads-heading'));
        const search = document.getElementById('view-search');
        if (search?.dataset.onlineSearch !== 'true' && !search?.classList.contains('hidden')) {
            let heading = document.getElementById('collection-page-heading');
            if (!heading) { heading = document.createElement('header'); heading.id = 'collection-page-heading'; heading.className = 'collection-page-heading'; heading.innerHTML = '<h2></h2>'; search.prepend(heading); }
            const name = document.getElementById('page-title')?.textContent || '收藏';
            if (heading.firstElementChild.textContent !== name) heading.firstElementChild.textContent = name;
            mount(search, heading);
        }
        document.querySelectorAll('.song-row-actions').forEach(actions => {
            if (actions.querySelector('[data-library-more],.song-maintenance-menu')) return;
            const love = actions.querySelector('[data-love-song]');
            if (!love) return;
            const button = document.createElement('button'); button.type = 'button'; button.className = 'song-maintenance-menu'; button.title = '补全与嵌入'; button.setAttribute('aria-label', '歌曲维护'); button.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
            button.onclick = event => {
                event.stopPropagation();
                let song = JSON.parse(decodeURIComponent(love.dataset.loveSong));
                if (actions.closest('#view-downloads')) {
                    const task = window.SystemDownloadManager.tasks.find(task => actions.closest('.download-task-row')?.id === 'dl-task-' + task.id);
                    if (task) song = downloadSong(task);
                }
                menu(button, maintenanceEntries([song]));
            };
            actions.append(button);
        });
        syncDock();
        for (const tool of tools.values()) {
            const roam = tool.bar.querySelector('button');
            if (roam?.textContent === '漫游播放') roam.hidden = tool.view.id === 'view-search' && (!songsFor(tool.view).length || window.currentViewingListId === 'dislike_songs');
        }
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-library-more]');
        if (button) { event.preventDefault(); event.stopPropagation(); rowMenu(button, Number(button.dataset.libraryMore)); }
    }, true);
    document.addEventListener('scroll', syncDock, true);
    let queued = false;
    new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; refreshTools(); }); }).observe(document.querySelector('.music-shell'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-online-search'] });
    window.MusicMaintenance = { start, menu, maintenanceEntries, downloadSong, setScan(value) { scan = value; renderProgress(); }, more, refreshTools, songsFor };
    refreshTools(); poll(); timer = setInterval(poll, 2000);
    window.addEventListener('pagehide', () => clearInterval(timer));
})();
