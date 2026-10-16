/** 本地优先的随机/漫游适配器；纯抽样规则由 roaming_core.js 提供。 */
(function (root) {
    const core = root.RoamingCore || (typeof require === 'function' ? require('./roaming_core.js') : null);
    if (!core) throw new Error('roaming_core.js 必须在 roaming.js 之前加载');

    const MAX_PENDING = 10000;
    let counts = {}, extras = {}, pending = {}, confirmed = new Set();
    let scope = '', stateLoaded = false, version = 0, refreshPromise = null, refreshScope = '';
    let provider = null;

    const owner = () => root.ClientSync?.owner?.() || '_open';
    const store = () => root.ListStore;
    const cloneMap = value => Object.fromEntries(Object.entries(value || {}).filter(([, item]) => Number.isFinite(item) && item >= 0));
    const currentScope = name => store()?.scope?.(name) || name;

    function normalizePending(value) {
        if (!value || typeof value !== 'object') return {};
        const result = {};
        for (const [id, item] of Object.entries(value)) {
            if (!id || typeof item !== 'object' || typeof item.key !== 'string') continue;
            result[id] = { key: item.key, count: core.valid(item.count || 1) || 1, createdAt: Number(item.createdAt) || Date.now() };
        }
        return result;
    }

    function normalizeState(value, name = owner()) {
        const confirmedIds = Array.isArray(value?.confirmedPlaybackIds) ? value.confirmedPlaybackIds.filter(id => typeof id === 'string') : [];
        const nextPending = normalizePending(value?.pending);
        for (const id of confirmedIds) delete nextPending[id];
        const ids = Object.keys(nextPending).slice(-MAX_PENDING);
        return {
            schema: 1,
            scope: value?.scope || currentScope(name),
            serverRevision: value?.serverRevision ?? value?.revision ?? null,
            counts: cloneMap(value?.counts),
            extraWeights: cloneMap(value?.extraWeights || value?.extras),
            pending: Object.fromEntries(ids.map(id => [id, nextPending[id]])),
            confirmedPlaybackIds: confirmedIds.slice(-MAX_PENDING),
            fetchedAt: Number(value?.fetchedAt) || 0,
        };
    }

    function applyState(value, name = owner()) {
        const next = normalizeState(value, name);
        scope = next.scope || currentScope(name);
        counts = next.counts;
        extras = next.extraWeights;
        pending = next.pending;
        confirmed = new Set(next.confirmedPlaybackIds);
        stateLoaded = true;
        return next;
    }

    async function loadState(name = owner()) {
        const nextScope = currentScope(name);
        if (stateLoaded && scope === nextScope) return;
        let value = null;
        try { value = await store()?.getRoamingState?.(name); } catch { value = null; }
        applyState(value || { scope: nextScope }, name);
    }

    function effectiveCounts() {
        const result = { ...counts };
        for (const item of Object.values(pending)) result[item.key] = core.valid(result[item.key]) + core.valid(item.count || 1);
        return result;
    }

    async function persist(update, name = owner()) {
        const nextScope = currentScope(name);
        if (typeof store()?.updateRoamingState !== 'function') {
            return applyState(update(normalizeState({ scope: nextScope }, name)), name);
        }
        const saved = await store().updateRoamingState(previous => update(normalizeState(previous || { scope: nextScope }, name)), name);
        applyState(saved, name);
        return saved;
    }

    /** 使用已确认快照叠加尚未确认的本地播放增量。 */
    function choose(songs, current = -1, random = Math.random) {
        return core.chooseWeighted(songs, current, random, effectiveCounts(), extras);
    }

    function chooseUniform(songs, current = -1, random = Math.random) {
        return core.chooseUniform(songs, current, random);
    }

    /** 有效播放一旦产生就更新本地投影；网络上报由现有同步链负责。 */
    async function recordQualified(song, playback = {}) {
        const playbackId = typeof playback.playbackId === 'string' ? playback.playbackId : '';
        if (!playbackId || !song) return false;
        const name = owner();
        await loadState(name);
        let changed = false;
        await persist(previous => {
            if (previous.pending[playbackId] || previous.confirmedPlaybackIds.includes(playbackId)) return previous;
            const nextPending = { ...previous.pending, [playbackId]: { key: core.key(song), count: 1, createdAt: Date.now() } };
            const ids = Object.keys(nextPending).slice(-MAX_PENDING);
            changed = true;
            return { ...previous, pending: Object.fromEntries(ids.map(id => [id, nextPending[id]])) };
        }, name);
        return changed;
    }

    /** 后台获取权重快照；同一账号并发调用合并为一个请求，不阻塞本地选曲。 */
    function refresh(songs = []) {
        const name = owner();
        if (refreshPromise && refreshScope === currentScope(name)) return refreshPromise;
        const requestVersion = ++version;
        refreshScope = currentScope(name);
        refreshPromise = (async () => {
            await loadState(name);
            if (typeof root.fetch !== 'function') return null;
            const response = await root.fetch('/api/user/roaming/weights', { headers: root.getUserAuthHeaders?.() || {}, cache: 'no-store' });
            if (!response.ok) throw new Error('漫游权重加载失败');
            const data = await response.json();
            if (requestVersion !== version || refreshScope !== currentScope(name)) return null;
            const extra = provider ? await provider(songs.slice()) : data.extraWeights;
            if (requestVersion !== version || refreshScope !== currentScope(name)) return null;
            await persist(previous => {
                const confirmedIds = Array.isArray(data.confirmedPlaybackIds) ? data.confirmedPlaybackIds.filter(id => typeof id === 'string') : [];
                const nextPending = { ...previous.pending };
                for (const id of confirmedIds) delete nextPending[id];
                return {
                    ...previous,
                    counts: cloneMap(data.counts),
                    extraWeights: cloneMap(extra || previous.extraWeights),
                    serverRevision: data.revision ?? data.epoch ?? previous.serverRevision,
                    pending: nextPending,
                    confirmedPlaybackIds: [...new Set([...previous.confirmedPlaybackIds, ...confirmedIds])].slice(-MAX_PENDING),
                    fetchedAt: Date.now(),
                };
            }, name);
            return data;
        })().finally(() => { refreshPromise = null; });
        return refreshPromise;
    }

    async function localCandidates(listId) {
        const localStore = store();
        if (!localStore) return [];
        if (listId && listId !== 'roaming' && typeof localStore.getList === 'function') {
            const selected = await localStore.getList(listId, { localOnly: true });
            if (Array.isArray(selected?.list)) return selected.list;
        }
        const snapshot = await localStore.getLocal?.();
        if (!snapshot) return [];
        if (Array.isArray(snapshot.defaultList) && snapshot.defaultList.length) return snapshot.defaultList;
        if (Array.isArray(snapshot.loveList) && snapshot.loveList.length) return snapshot.loveList;
        return [];
    }

    async function start(songs, listId = 'roaming') {
        const source = Array.isArray(songs) ? songs : await localCandidates(listId);
        const playable = source.map(song => root.MusicExperience?.playable?.(song) || song).filter(Boolean);
        if (!playable.length) { root.showInfo?.('没有可漫游的本地歌曲'); return -1; }
        await loadState(owner());
        const index = choose(playable);
        root.setPlayMode?.('roaming');
        root.updatePlaylist?.(playable, index, listId, false);
        void refresh(playable).catch(error => root.console?.warn?.('[Roaming] 后台权重刷新失败:', error));
        return index;
    }

    function setWeights(values, extra = {}, metadata = {}) {
        applyState({ scope: currentScope(owner()), counts: values, extraWeights: extra, ...metadata, pending, confirmedPlaybackIds: [...confirmed] });
    }

    function reset() {
        version++;
        counts = {}; extras = {}; pending = {}; confirmed = new Set(); stateLoaded = false; scope = '';
        refreshPromise = null; refreshScope = '';
    }

    root.Roaming = {
        key: core.key,
        weight: song => core.weight(song, effectiveCounts(), extras),
        choose, chooseUniform, refresh, start, recordQualified,
        setExtraWeightProvider(fn) { provider = typeof fn === 'function' ? fn : null; },
        setWeights, reset,
        projection() { return { scope, counts: { ...counts }, extraWeights: { ...extras }, pending: { ...pending }, confirmedPlaybackIds: [...confirmed] }; },
        loadState,
    };
    if (typeof module !== 'undefined') module.exports = root.Roaming;
})(typeof window === 'undefined' ? globalThis : window);
