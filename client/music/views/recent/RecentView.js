/** 最近播放与本地歌手、专辑详情列表组件。 @author yahyaoo @date 2026-10-10 */
(() => {
    let entries = [], originalEntries = [], count = 100, recent = true, version = 0, loadState = 'ready', hasLoaded = false, loadedOwner = null, lastFetchAt = 0, pageSize = 100, nextOffset = 0, serverPaged = false, loadingMore = false;
    let query = '', searchOpen = false, batch = false, sortByName = false;
    const selected = new Set();
    window.RecentView = {
        getEntries() { return entries.slice(); },
        invalidate() { lastFetchAt = 0; },
        refreshFiles() {
            originalEntries = window.SongFiles?.enrich(originalEntries) || originalEntries;
            entries = sortByName ? originalEntries.slice().sort((a, b) => a.name.localeCompare(b.name)) : recent ? window.PlayStatistics.sortByPlayCount(originalEntries) : originalEntries.slice();
            this.render();
        },
        async load(force = false) {
            const host = document.getElementById('recent-list');
            const owner = window.MusicExperience.account;
            const preserveCurrent = hasLoaded && recent && loadedOwner === owner;
            // 仅复用最近记录；歌手、专辑详情共用此组件，不能当作最近列表缓存。
            if (!force && preserveCurrent && Date.now() - lastFetchAt < 10000) return;
            if (!preserveCurrent) {
                loadState = 'loading';
                host.innerHTML = window.LoadingState.render('正在加载最近播放…', 'page');
            }
            const requestVersion = ++version;
            try {
                let response = await fetch(`/api/user/recent?offset=0&limit=${pageSize}&sort=time&order=desc`, { headers: window.getUserAuthHeaders() });
                if (response.status === 404) { serverPaged = false; response = await fetch('/api/user/recent', { headers: window.getUserAuthHeaders() }); }
                if (!response.ok) throw new Error('最近播放加载失败');
                const data = await response.json();
                if (owner !== window.MusicExperience.account || requestVersion !== version) return;
                lastFetchAt = Date.now();
                serverPaged = Array.isArray(data.items) && Number.isFinite(data.total); nextOffset = serverPaged ? data.offset + data.items.length : data.items?.length || 0; this.show('最近播放', data.items || [], true, data.limit || pageSize, data.total); hasLoaded = true; loadedOwner = owner;
            } catch (error) {
                if (owner !== window.MusicExperience.account || requestVersion !== version) return;
                if (preserveCurrent) return;
                loadState = 'error';
                console.warn('[Recent] 加载失败:', error);
                window.LoadingState.showFailure(host, { title: '最近播放暂时无法加载', variant: 'page', retry: () => this.load() });
            }
        },
        show(title, items, isRecent = false, limit, total) {
            ++version;
            loadState = 'ready';
            query = ''; searchOpen = batch = sortByName = false; selected.clear();
            items = window.SongFiles?.enrich(items) || items;
            originalEntries = items.slice(); nextOffset = items.length; pageSize = limit || pageSize; this.total = total ?? items.length;
            entries = isRecent ? window.PlayStatistics.sortByPlayCount(items) : items.slice(); count = 100; recent = isRecent;
            document.getElementById('recent-title').textContent = title;
            document.getElementById('recent-meta').textContent = `${total ?? items.length} 首${isRecent ? ` · 最多保留 ${limit} 条` : ' · 音乐库'}`;
            document.getElementById('recent-clear').classList.toggle('hidden', !isRecent);
            this.render();
        },
        render() {
            // 窗口缩放及文件状态更新不能覆盖加载占位或失败后的重试入口。
            if (loadState !== 'ready') return;
            const host = document.getElementById('recent-list'); host.replaceChildren();
            const header = document.createElement('div'); header.className = 'recent-table-header';
            header.innerHTML = `<div class="recent-header-controls"><button type="button" title="歌曲排序" aria-label="歌曲排序" aria-pressed="${sortByName}" onclick="RecentView.toggleSort()"><i class="fas fa-sort-amount-down"></i></button><button type="button" title="批量操作" aria-label="批量操作" aria-pressed="${batch}" onclick="RecentView.toggleBatch()"><i class="fas fa-tasks"></i></button><button type="button" title="内搜索 (/)" aria-label="列表内搜索" aria-expanded="${searchOpen}" onclick="RecentView.toggleSearch()"><i class="fas fa-search"></i></button></div>` + `<span>歌曲 / 歌手</span><span class="recent-album">${recent ? '播放次数 ↓' : '专辑'}</span><span class="recent-time">${recent ? '最近播放时间' : '音质'}</span>`;
            host.append(header);
            if (searchOpen) {
                const search = document.createElement('input'); search.type = 'search'; search.className = 'recent-search';
                search.placeholder = '搜索歌曲 / 歌手 / 专辑'; search.value = query; search.setAttribute('aria-label', '列表内搜索');
                search.oninput = () => { query = search.value; this.render(); const input = document.querySelector('.recent-search'); input?.focus(); };
                host.append(search);
            }
            if (batch) {
                const toolbar = document.createElement('div'); toolbar.className = 'recent-batch-toolbar';
                toolbar.innerHTML = `<span>已选 ${selected.size} 首</span><button onclick="RecentView.selectAll()">全选</button><button onclick="RecentView.collectSelected()">加入歌单</button><button onclick="RecentView.downloadSelected()">下载</button><button onclick="RecentView.toggleBatch()">退出</button>`;
                host.append(toolbar);
            }
            const display = entries.map((song, index) => ({ song, index })).filter(({ song }) =>
                [song.name, song.singer, window.getSongAlbumName?.(song)].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
            if (!entries.length) { const empty = document.createElement('div'); empty.className = 'recent-empty'; empty.innerHTML = '<i class="far fa-clock"></i><strong>还没有播放记录</strong><span>成功播放超过 10 秒后，歌曲会出现在这里</span>'; host.append(empty); return; }
            if (!display.length) {
                const empty = document.createElement('div'); empty.className = 'recent-empty'; empty.textContent = '没有匹配的歌曲'; host.append(empty); return;
            }
            display.slice(0, count).forEach(({ song, index }) => {
                const row = document.createElement('div'); row.className = 'recent-song song-row';
                const number = document.createElement('span'); number.className = 'recent-number'; number.textContent = String(index + 1).padStart(2, '0');
                if (batch) {
                    number.textContent = ''; const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
                    checkbox.checked = selected.has(index); checkbox.setAttribute('aria-label', '选择 ' + song.name);
                    checkbox.onclick = event => { event.stopPropagation(); this.select(index); }; number.append(checkbox);
                }
            const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
            // 最近列表复用统一视口门控，避免进入页面时为所有历史歌曲并发读取封面。
            if (window.LibraryArtwork?.bind) window.LibraryArtwork.bind(img, song);
            else window.LibraryArtwork?.attach(img, window.MusicExperience.coverCandidates(song));
                const cover = document.createElement('button'); cover.type = 'button'; cover.className = 'song-cover recent-song-cover recent-play-button'; cover.title = '播放';
                const overlay = document.createElement('span'); overlay.className = 'song-cover-play'; overlay.innerHTML = '<i class="fas fa-play"></i>';
                cover.append(img, overlay);
                cover.onclick = event => { event.stopPropagation(); this.play(index); };
                const info = document.createElement('span'); info.className = 'recent-song-info';
                const name = document.createElement('strong'); name.className = 'song-file-title'; name.textContent = song.name;
                const singer = document.createElement('small'); singer.textContent = song.singer || '未知歌手'; info.append(name, singer);
                const specs = document.createElement('span'); specs.className = 'recent-song-specs'; specs.innerHTML = window.SongMetadata?.render(song) || ''; info.append(specs);
                const album = document.createElement('span'); album.className = recent ? 'recent-album recent-play-count' : 'recent-album'; album.textContent = recent ? `${window.PlayStatistics.playCount(song)} 次` : song.albumName || song.album || '—';
                const date = document.createElement('time'); date.className = 'recent-time';
                const dateText = recent ? new Date(song.playedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : song.quality || '';
                const summary = document.createElement('span'); summary.className = 'recent-mobile-count'; summary.textContent = recent ? `${window.PlayStatistics.playCount(song)} 次播放 · ` : '';
                date.append(summary, document.createTextNode(dateText));
                const more = document.createElement('button'); more.type = 'button'; more.className = 'recent-maintenance-more'; more.title = '更多'; more.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
                more.onclick = event => { event.stopPropagation(); window.MusicMaintenance.menu(more, [window.SongFiles?.menuEntry(more, song), ...window.MusicMaintenance.maintenanceEntries([song])].filter(Boolean)); };
                const actions = document.createElement('span'); actions.className = 'recent-song-actions'; actions.innerHTML = (window.SongActions?.renderLoveButton(song) || '') + (window.SongActions?.renderQueueButton(song) || ''); actions.append(more);
                row.append(number, cover, info, album, date, actions); row.onclick = () => batch ? this.select(index) : this.play(index); host.append(row);
            });
            window.SongFileStatus?.update(host, display.slice(0, count).map(item => item.song), '.recent-song-info strong');
            if ((serverPaged && nextOffset < (window.RecentView.total || Infinity)) || (!serverPaged && display.length > count)) { const more = document.createElement('button'); more.className = 'recent-more'; more.textContent = loadingMore ? '正在加载…' : '加载更多'; more.onclick = () => serverPaged ? this.loadMore() : (count += 100, this.render()); host.append(more); }
        },
        total: 0,
        async loadMore() {
            if (loadingMore || !serverPaged) return; loadingMore = true; this.render();
            try { const response = await fetch(`/api/user/recent?offset=${nextOffset}&limit=${pageSize}&sort=time&order=desc`, { headers: window.getUserAuthHeaders() }); const data = await response.json(); if (!response.ok) throw new Error('加载失败'); this.total = Number(data.total || this.total); const more = data.items || []; originalEntries = originalEntries.concat(more); entries = recent ? window.PlayStatistics.sortByPlayCount(originalEntries) : originalEntries.slice(); nextOffset += more.length; this.render(); } catch (error) { console.warn('[Recent] 加载更多失败', error); } finally { loadingMore = false; }
        },
        /** 排序只调整当前展示；原始顺序可一键恢复，不保存到歌曲数据。 */
        toggleSort() {
            sortByName = !sortByName; selected.clear();
            entries = sortByName ? entries.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'))
                : recent ? window.PlayStatistics.sortByPlayCount(originalEntries) : originalEntries.slice();
            this.render();
        },
        toggleSearch() { searchOpen = !searchOpen; if (!searchOpen) query = ''; this.render(); document.querySelector('.recent-search')?.focus(); },
        toggleBatch() { batch = !batch; selected.clear(); this.render(); },
        select(index) { selected.has(index) ? selected.delete(index) : selected.add(index); this.render(); },
        selectAll() {
            entries.forEach((song, index) => { if ([song.name, song.singer, window.getSongAlbumName?.(song)].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))) selected.add(index); });
            this.render();
        },
        selectedSongs() { return [...selected].sort((a, b) => a - b).map(index => window.MusicExperience.playable(entries[index])); },
        collectSelected() { const songs = this.selectedSongs(); if (songs.length) { window.batchCollectSongs = songs; window.openPlaylistAddModal(); } },
        downloadSelected() { const songs = this.selectedSongs(); if (songs.length) window.batchDownloadSongs?.(songs); },
        play(index = 0) {
            if (!entries.length) return;
            const song = window.MusicExperience.playable(entries[index]);
            window.updatePlaylist([song], 0, 'recent', false);
        },
        async clear() {
            if (typeof showSelect === 'function' && !await showSelect('清空最近播放', '确定清空当前账号的最近播放记录吗？', { danger: true })) return;
            const response = await fetch('/api/user/recent', { method: 'DELETE', headers: window.getUserAuthHeaders() });
            if (!response.ok) { window.showError?.('清空失败'); return; }
            await this.load(true);
        },
    };
})();
