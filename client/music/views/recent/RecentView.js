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
            entries = items; count = 100; recent = isRecent;
            document.getElementById('recent-title').textContent = title;
            document.getElementById('recent-meta').textContent = `${items.length} 首${isRecent ? ` · 最多保留 ${limit} 条` : ' · 音乐库'}`;
            document.getElementById('recent-clear').classList.toggle('hidden', !isRecent);
            this.render();
        },
        render() {
            const host = document.getElementById('recent-list'); host.replaceChildren();
            if (!entries.length) { const empty = document.createElement('div'); empty.className = 'recent-empty'; empty.innerHTML = '<i class="far fa-clock"></i><strong>还没有播放记录</strong><span>播放音乐后，你可以在这里重新找到它</span>'; host.append(empty); return; }
            entries.slice(0, count).forEach((song, index) => {
                const row = document.createElement('button'); row.className = 'recent-song'; row.type = 'button';
                const number = document.createElement('span'); number.className = 'recent-number'; number.textContent = String(index + 1).padStart(2, '0');
                const img = document.createElement('img'); img.alt = ''; window.LibraryArtwork.attach(img, song.filename ? window.MusicExperience.coverUrl(song) : song.pic || song.img);
                const info = document.createElement('span'); info.className = 'recent-song-info';
                const name = document.createElement('strong'); name.textContent = song.name;
                const singer = document.createElement('small'); singer.textContent = song.singer || '未知歌手'; info.append(name, singer);
                const album = document.createElement('span'); album.className = 'recent-album'; album.textContent = song.albumName || song.album || '—';
                const date = document.createElement('time'); date.className = 'recent-time'; date.textContent = recent ? new Date(song.playedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : song.quality || '';
                row.append(number, img, info, album, date); row.onclick = () => this.play(index); host.append(row);
            });
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
