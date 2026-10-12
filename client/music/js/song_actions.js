/** 歌曲行共用的直接喜欢按钮与状态刷新。 */
(function () {
    let queue = Promise.resolve();
    const activeData = () => isUserLoggedIn() ? (window.myPersonalListData || currentListData) : currentListData;
    const channelFor = data => ['_open', 'default', 'open'].includes(data?.username) ? 'favorites-public' : 'favorites';
    const sameSong = (a, b) => window.SongIdentity ? !!window.SongIdentity.key(a) && window.SongIdentity.key(a) === window.SongIdentity.key(b) : !!a.id && a.id === b.id;

    function isLoved(song) {
        if (!song) return false;
        const cleaned = cleanSongData(song);
        return !!activeData()?.loveList?.some(item => sameSong(item, cleaned));
    }

    function renderLoveButton(song) {
        const loved = isLoved(song);
        // 编码完整对象，避免歌曲名中的引号或尖括号破坏属性。
        const value = encodeURIComponent(JSON.stringify(song)).replace(/'/g, '%27');
        return `<button type="button" class="song-love-btn ${loved ? 'text-red-500' : 't-text-muted'}" aria-pressed="${loved}" title="${loved ? '取消喜欢' : '喜欢'}" data-love-song="${value}" onclick="event.stopPropagation(); window.SongActions.toggleLove(JSON.parse(decodeURIComponent(this.dataset.loveSong)))"><i class="${loved ? 'fas' : 'far'} fa-heart w-3.5 h-3.5 flex items-center justify-center"></i></button>`;
    }

    function refresh() {
        document.querySelectorAll('[data-love-song]').forEach(button => {
            const loved = isLoved(JSON.parse(decodeURIComponent(button.dataset.loveSong)));
            button.setAttribute('aria-pressed', String(loved));
            button.title = loved ? '取消喜欢' : '喜欢';
            button.classList.toggle('text-red-500', loved);
            button.classList.toggle('t-text-muted', !loved);
            button.querySelector('i').classList.toggle('fas', loved);
            button.querySelector('i').classList.toggle('far', !loved);
        });
    }

    function toggleLove(song) {
        const operation = queue.then(async () => {
            if (!song) return;
            if ((song.isLocal || song._localLibraryItem) && !window.LocalMusicManager?.isPlaylistCollectable(song)) {
                showError('请先使用“手动关联”绑定平台歌曲 ID，再加入喜欢');
                return;
            }
            const data = await ensurePlaylistDataAvailable();
            if (!data) { showError('请先登录或创建歌单'); return; }
            if (!isUserLoggedIn() && !(await requireAdminForOpenWrite('修改公开喜欢歌曲'))) return;
            const cleaned = cleanSongData(song);
            if (window.ClientSync) {
                const channel = channelFor(data);
                window.ClientSync.seed(channel, data.loveList || []);
                const original = data.loveList;
                const next = [...original];
                const index = next.findIndex(item => sameSong(item, cleaned));
                if (index < 0) addMusicByConfiguredLocation(next, cleaned);
                else next.splice(index, 1);
                data.loveList = next;
                renderMyLists(currentListData); refresh();
                if (window.currentViewingListId === 'love' && data === currentListData) handleListClick('love', true, true);
                if (currentPlayingSong) updatePlayerInfo(currentPlayingSong);
                await window.ClientSync.update(channel, next);
                await window.ListStore.cache?.(data);
                showSuccess(index < 0 ? '已加入喜欢' : '已取消喜欢');
                return;
            }
            const next = { ...data, loveList: [...data.loveList] };
            const index = next.loveList.findIndex(item => sameSong(item, cleaned));
            const willLove = index < 0;
            if (willLove) addMusicByConfiguredLocation(next.loveList, cleaned);
            else next.loveList.splice(index, 1);
            if (window.SyncManager?.mode === 'remote' && window.SyncManager.client) {
                await window.SyncManager.push(next);
            } else {
                const response = await fetch('/api/user/favorites' + (!isUserLoggedIn() ? '?user=_open' : ''), {
                    method: 'POST', headers: { ...getUserAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ song: cleaned, loved: willLove, location: window.CONFIG?.['list.addMusicLocationType'] })
                });
                if (!response.ok) throw new Error(await response.text() || '保存喜欢失败');
                const saved = await response.json();
                if (!saved.success || !Array.isArray(saved.items)) throw new Error(saved.error || '保存喜欢失败');
                next.loveList = saved.items;
            }
            // 请求期间切换账号时，旧账号的结果不能刷新当前界面。
            if (data !== activeData()) return;
            data.loveList = next.loveList;
            await window.ListStore.set(data).catch(error => console.warn('[SongActions] 本地缓存保存失败:', error));
            renderMyLists(currentListData);
            refresh();
            if (window.currentViewingListId === 'love' && data === currentListData) handleListClick('love', true, true);
            if (currentPlayingSong) updatePlayerInfo(currentPlayingSong);
            showSuccess(willLove ? '已加入喜欢' : '已取消喜欢');
        });
        queue = operation.catch(error => showError('操作失败：' + error.message));
        return queue;
    }

    /** 本地未同步喜爱优先恢复，不能被服务端旧列表覆盖。 @author jingyh */
    async function restorePending(data) {
        if (!data || !window.ClientSync) return;
        const channel = channelFor(data);
        const items = await window.ClientSync.read(channel);
        if (items) data.loveList = items;
        else window.ClientSync.seed(channel, data.loveList || []);
    }
    const submitFavorites = isPublic => async (items, context) => {
        if (!isPublic && window.SyncManager?.mode === 'remote' && window.SyncManager.client) {
            await window.SyncManager.push({ ...activeData(), loveList: items }); return;
        }
        const baseline = JSON.parse(context.baseline || '[]');
        const attempted = JSON.parse(context.uncertainBaseline || context.baseline || '[]');
        const removed = [...baseline, ...attempted].filter((song, index, all) => all.findIndex(item => sameSong(item, song)) === index && !items.some(item => sameSong(item, song)));
        const changes = removed.map(song => ({ song, loved: false }));
        const additions = items.filter(song => !baseline.some(item => sameSong(item, song)) || !attempted.some(item => sameSong(item, song)));
        const location = window.CONFIG?.['list.addMusicLocationType'] || 'top';
        if (location === 'top') additions.reverse();
        changes.push(...additions.map(song => ({ song, loved: true, location })));
        // 只对仍保留的成员比较顺序，新增/删除按既有添加位置规则执行。
        const orderChanged = prior => {
            const common = items.filter(song => prior.some(item => sameSong(item, song)));
            const oldCommon = prior.filter(song => items.some(item => sameSong(item, song)));
            return common.some((song, index) => !sameSong(song, oldCommon[index]));
        };
        const reordered = orderChanged(baseline) || orderChanged(attempted);
        if (!changes.length && !reordered) return;
        const headers = { ...context.headers, 'Content-Type': 'application/json' };
        if (isPublic) headers['x-user-name'] = '_open';
        if (changes.length) {
        const response = await fetch('/api/user/favorites' + (isPublic ? '?user=_open' : ''), {
            method: 'POST', headers,
            body: JSON.stringify({ changes }), signal: context.signal
        });
        if (!response.ok) throw new Error(await response.text() || '保存喜欢失败');
        }
        if (reordered) {
            const response = await fetch('/api/music/user/list/reorder', { method: 'POST', headers, signal: context.signal,
                body: JSON.stringify({ listId: 'love', orderedSongIds: items.map(song => String(song.id)) }) });
            if (!response.ok) throw new Error(await response.text() || '保存喜欢排序失败');
        }
    };
    window.ClientSync?.register('favorites', submitFavorites(false));
    window.ClientSync?.register('favorites-public', submitFavorites(true));
    window.SongActions = { isLoved, renderLoveButton, toggleLove, refresh, restorePending };
})();
