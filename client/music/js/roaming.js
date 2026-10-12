/** 按个人播放量加权的漫游核心，额外权重提供器可接模型。 @author yahyaoo @date 2026-10-12 */
(function (root) {
    const key = song => `${song.source}:${String(song.songmid || song.meta?.songmid || song.id || '').replace(new RegExp('^' + song.source + '_'), '')}`;
    let counts = {}, extras = {}, provider = null, version = 0;
    const valid = value => Number.isFinite(value) && value >= 0 ? value : 0;
    const weight = song => Math.min(1e9, 1 + valid(counts[key(song)] ?? song.playCount) + valid(extras[key(song)]));
    /** 注入随机源以便验证边界；按权重抽样，结果为原数组下标。 */
    function choose(songs, current = -1, random = Math.random) {
        if (!songs.length) return -1;
        const candidates = songs.map((song, index) => ({ index, weight: weight(song) })).filter(item => songs.length === 1 || item.index !== current);
        const total = candidates.reduce((sum, item) => sum + item.weight, 0);
        let point = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
        for (const item of candidates) { point -= item.weight; if (point < 0) return item.index; }
        return candidates[candidates.length - 1].index;
    }
    async function refresh(songs = []) {
        const request = ++version;
        const response = await root.fetch('/api/user/roaming/weights', { headers: root.getUserAuthHeaders(), cache: 'no-store' });
        if (!response.ok) throw new Error('漫游权重加载失败');
        const data = await response.json();
        const extra = provider ? await provider(songs.slice()) : data.extraWeights;
        if (request !== version) return;
        counts = data.counts || {}; extras = extra || {};
    }
    async function start(songs, listId = 'roaming') {
        const playable = songs.map(song => root.MusicExperience?.playable(song) || song);
        if (!playable.length) { root.showInfo?.('没有可漫游的歌曲'); return; }
        try { await refresh(playable); root.setPlayMode('roaming'); root.updatePlaylist(playable, choose(playable), listId, false); }
        catch (error) { root.showError?.(error.message); }
    }
    root.Roaming = { choose, weight, key, refresh, start, setExtraWeightProvider(fn) { provider = fn; }, reset() { version++; counts = {}; extras = {}; }, setWeights(values, extra = {}) { counts = values; extras = extra; } };
    if (typeof module !== 'undefined') module.exports = root.Roaming;
})(typeof window === 'undefined' ? globalThis : window);
