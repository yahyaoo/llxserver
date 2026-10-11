/** 歌曲列表的服务器文件状态组件，复用当前账号请求和按页批量查询。 @author jingyh */
(function () {
    const bindings = new Map();
    const states = {
        loading: ['fa-spinner fa-spin', '正在检查文件状态'],
        downloaded: ['fa-download', '已下载到服务器'],
        cached: ['fa-database', '已缓存'],
        cloud: ['fa-cloud', '云端（未下载）'],
        unknown: ['fa-question-circle', '文件状态暂不可用']
    };
    const scope = () => JSON.stringify(window.getUserAuthHeaders?.() || {});
    const scalar = value => typeof value === 'string' || typeof value === 'number' ? value : undefined;
    /** 只发送识别歌曲需要的字段，避免携带播放 URL 和无关元数据。 */
    function describe(song) {
        const meta = song.meta || {};
        return Object.fromEntries(['id', 'source', 'songmid', 'songId', 'name', 'singer', 'albumName'].map(key => [key, scalar(song[key] || meta[key])]).concat([
            ['album', scalar(song.album) || scalar(song.album?.name)]
        ]).filter(([, value]) => value !== undefined));
    }
    function paint(slot, state) {
        const [icon, label] = states[state] || states.unknown;
        slot.dataset.fileState = state;
        slot.title = label;
        slot.setAttribute('aria-label', label);
        slot.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
    }
    /** 每次绑定记录节点本身，过期响应无法写入翻页后的新节点。 */
    async function query(container, binding) {
        binding.pending = true;
        try {
            const revision = ++binding.revision;
            const account = scope();
            const current = () => bindings.get(container) === binding && binding.revision === revision && scope() === account;
            for (let offset = 0; offset < binding.songs.length; offset += 500) {
                const count = Math.min(500, binding.songs.length - offset);
                try {
                    const response = await window.fetchDownloadWithAuth('/api/music/file-status', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ songs: binding.songs.slice(offset, offset + count).map(describe) })
                    });
                    if (!response.ok) throw new Error('状态查询失败');
                    const result = await response.json();
                    if (!result.success || !Array.isArray(result.statuses) || result.statuses.length !== count) throw new Error('状态响应不完整');
                    if (!current()) return;
                    result.statuses.forEach((item, index) => {
                        if (binding.slots[offset + index]) paint(binding.slots[offset + index], ['downloaded', 'cached', 'cloud'].includes(item.state) ? item.state : 'unknown');
                    });
                } catch {
                    if (!current()) return;
                    binding.slots.slice(offset, offset + count).forEach(slot => paint(slot, 'unknown'));
                }
            }
        } finally { binding.pending = false; }
    }
    /** 为当前页的歌名节点添加图标；调用方提供与歌曲顺序一致的选择器。 */
    function update(container, songs, selector = '.song-file-title') {
        if (!container) return Promise.resolve();
        const titles = Array.from(container.querySelectorAll(selector));
        const slots = titles.map(title => {
            let slot = title.querySelector('.song-file-status');
            if (!slot) {
                const text = document.createElement('span');
                text.className = 'song-file-name';
                while (title.firstChild) text.appendChild(title.firstChild);
                title.appendChild(text);
                slot = document.createElement('span');
                slot.className = 'song-file-status';
                slot.setAttribute('role', 'img');
                title.appendChild(slot);
            }
            title.classList.add('song-file-title');
            paint(slot, 'loading');
            return slot;
        });
        const binding = { songs: songs.slice(), slots, revision: 0, account: scope() };
        bindings.set(container, binding);
        if (!slots.length) { bindings.delete(container); return Promise.resolve(); }
        return query(container, binding);
    }
    /** 仅刷新仍挂载且可见的列表，定期复查删除和外部新增的文件。 */
    function refresh() {
        if (document.hidden) return;
        for (const [container, binding] of bindings) {
            if (!container.isConnected || !binding.slots.some(slot => container.contains(slot))) { bindings.delete(container); continue; }
            if (binding.account !== scope()) {
                binding.account = scope();
                binding.slots.forEach(slot => paint(slot, 'loading'));
            }
            if (!binding.pending && container.getClientRects().length) void query(container, binding);
        }
    }
    window.SongFileStatus = { update, refresh };
    window.addEventListener('song-files-changed', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.setInterval(refresh, 15000);
})();
