/** 最近播放与本地歌手、专辑详情列表组件。 @author jingyh @date 2026-10-10 */
(() => {
    let entries = [], count = 100, recent = true, version = 0;
    window.RecentView = {
        async load() {
            const host = document.getElementById('recent-list'); host.textContent = '正在加载最近播放…';
            const requestVersion = ++version;
            const owner = window.MusicExperience.account;
            try {
                const response = await fetch('/api/user/recent', { headers: window.getUserAuthHeaders() });
                if (!response.ok) throw new Error('最近播放加载失败');
                const data = await response.json();
                if (owner !== window.MusicExperience.account || requestVersion !== version) return;
                this.show('最近播放', data.items, true, data.limit);
            } catch (error) { if (owner === window.MusicExperience.account && requestVersion === version) host.textContent = error.message; }
        },
        show(title, items, isRecent = false, limit) {
            ++version;
            entries = isRecent ? window.PlayStatistics.sortByPlayCount(items) : items.slice(); count = 100; recent = isRecent;
            document.getElementById('recent-title').textContent = title;
            document.getElementById('recent-meta').textContent = `${items.length} 首${isRecent ? ` · 最多保留 ${limit} 条` : ' · 音乐库'}`;
            document.getElementById('recent-clear').classList.toggle('hidden', !isRecent);
            this.render();
        },
        render() {
            const host = document.getElementById('recent-list'); host.replaceChildren();
            const header = document.createElement('div'); header.className = 'recent-table-header';
            header.innerHTML = `<span class="recent-number" aria-hidden="true"></span><span class="recent-cover-label" aria-hidden="true"></span><span>歌曲 / 歌手</span><span class="recent-album">${recent ? '播放次数 ↓' : '专辑'}</span><span class="recent-time">${recent ? '最近播放时间' : '音质'}</span>`;
            host.append(header);
            if (!entries.length) { const empty = document.createElement('div'); empty.className = 'recent-empty'; empty.innerHTML = '<i class="far fa-clock"></i><strong>还没有播放记录</strong><span>成功播放超过 10 秒后，歌曲会出现在这里</span>'; host.append(empty); return; }
            entries.slice(0, count).forEach((song, index) => {
                const row = document.createElement('div'); row.className = 'recent-song song-row';
                const number = document.createElement('span'); number.className = 'recent-number'; number.textContent = String(index + 1).padStart(2, '0');
                const img = document.createElement('img'); img.alt = ''; window.LibraryArtwork.attach(img, window.MusicExperience.coverCandidates(song));
                const cover = document.createElement('button'); cover.type = 'button'; cover.className = 'song-cover recent-song-cover recent-play-button'; cover.title = '播放';
                const overlay = document.createElement('span'); overlay.className = 'song-cover-play'; overlay.innerHTML = '<i class="fas fa-play"></i>';
                cover.append(img, overlay);
                cover.onclick = event => { event.stopPropagation(); this.play(index); };
                const info = document.createElement('span'); info.className = 'recent-song-info';
                const name = document.createElement('strong'); name.className = 'song-file-title'; name.textContent = song.name;
                const singer = document.createElement('small'); singer.textContent = song.singer || '未知歌手'; info.append(name, singer);
                const specs = document.createElement('span'); specs.className = 'recent-song-specs'; specs.innerHTML = window.SongMetadata?.render(song) || ''; info.append(specs);
                const album = document.createElement('span'); album.className = recent ? 'recent-album recent-play-count' : 'recent-album'; album.textContent = recent ? `${window.PlayStatistics.playCount(song)} 次` : song.albumName || song.album || '—';
                const date = document.createElement('time'); date.className = 'recent-time'; date.textContent = recent ? new Date(song.playedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : song.quality || '';
                row.append(number, cover, info, album, date); row.onclick = () => this.play(index); host.append(row);
            });
            window.SongFileStatus?.update(host, entries.slice(0, count), '.recent-song-info strong');
            if (entries.length > count) { const more = document.createElement('button'); more.className = 'recent-more'; more.textContent = `加载更多（剩余 ${entries.length - count} 首）`; more.onclick = () => { count += 100; this.render(); }; host.append(more); }
        },
        play(index = 0) {
            if (!entries.length) return;
            const playlist = entries.map(song => window.MusicExperience.playable(song));
            window.updatePlaylist(playlist, index, 'recent', false);
        },
        async clear() {
            if (typeof showSelect === 'function' && !await showSelect('清空最近播放', '确定清空当前账号的最近播放记录吗？', { danger: true })) return;
            const response = await fetch('/api/user/recent', { method: 'DELETE', headers: window.getUserAuthHeaders() });
            if (!response.ok) { window.showError?.('清空失败'); return; }
            await this.load();
        },
    };
})();
