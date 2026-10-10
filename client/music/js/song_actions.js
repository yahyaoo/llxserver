/** 歌曲行共用的直接喜欢按钮与状态刷新。 */
(function () {
    let queue = Promise.resolve();
    const activeData = () => isUserLoggedIn() ? (window.myPersonalListData || currentListData) : currentListData;

    function isLoved(song) {
        if (!song) return false;
        const id = cleanSongData(song)?.id;
        return !!activeData()?.loveList?.some(item => item.id === id);
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
            const next = { ...data, loveList: [...data.loveList] };
            const index = next.loveList.findIndex(item => item.id === cleaned.id);
            const willLove = index < 0;
            if (willLove) addMusicByConfiguredLocation(next.loveList, cleaned);
            else next.loveList.splice(index, 1);
            if (window.SyncManager?.mode === 'remote' && window.SyncManager.client) {
                await window.SyncManager.push(next);
            } else {
                const response = await fetch('/api/user/list' + (!isUserLoggedIn() ? '?user=_open' : ''), {
                    method: 'POST', headers: { ...getUserAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(next)
                });
                if (!response.ok) throw new Error(await response.text() || '保存喜欢失败');
            }
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

    window.SongActions = { isLoved, renderLoveButton, toggleLove, refresh };
})();
