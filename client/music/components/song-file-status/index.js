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
    function paint(slot, state) {
        const [icon, label] = states[state] || states.unknown;
        slot.dataset.fileState = state;
        slot.title = label;
        slot.setAttribute('aria-label', label);
        slot.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
    }
    /** 直接使用登录快照及服务端推送更新的文件目录，不因进入列表检查服务器。 */
    async function query(container, binding) {
        binding.songs.forEach((item, index) => {
            const song = window.SongFiles?.enrich([item])[0] || item;
            const files = song.files || [];
            const state = files.some(file => file.folder !== 'cache') ? 'downloaded' : files.length ? 'cached' : 'cloud';
            if (binding.slots[index]) paint(binding.slots[index], state);
        });
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
    window.addEventListener('song-files-updated', refresh);
})();
