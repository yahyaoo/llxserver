/** 本地随机/漫游的纯规则核心；不访问网络、存储、DOM 或账号状态。 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.RoamingCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    const sourceOf = song => typeof song?.source === 'string' && song.source ? song.source : 'local';
    const identifierOf = song => song?.songmid ?? song?.meta?.songmid ?? song?.id ?? song?.filename ?? song?.path ?? '';
    const stablePart = (source, value) => {
        const text = String(value ?? '');
        const prefix = source + '_';
        return text.startsWith(prefix) ? text.slice(prefix.length) : text;
    };

    /** 沿用历史 source:id 统计键，前缀按字符串处理，避免 source 作为正则造成误匹配。 */
    function key(song) {
        const source = sourceOf(song);
        return `${source}:${stablePart(source, identifierOf(song))}`;
    }

    /** 统计值只接受有限非负数，保持旧版异常值回退为零的行为。 */
    function valid(value) {
        return Number.isFinite(value) && value >= 0 ? value : 0;
    }

    /** 计算单个候选的漫游权重，服务端快照优先于歌曲自身播放量。 */
    function weight(song, counts = {}, extras = {}) {
        const songKey = key(song);
        const count = own(counts, songKey) ? counts[songKey] : song?.playCount;
        return Math.min(1e9, 1 + valid(count) + valid(extras[songKey]));
    }

    function randomUnit(random) {
        let value;
        try { value = Number(random?.()); } catch { value = 0; }
        return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
    }

    /** 均匀选择一次候选，排除当前条目且不使用无界重试。 */
    function chooseUniform(songs, current = -1, random = Math.random) {
        if (!Array.isArray(songs) || songs.length === 0) return -1;
        if (songs.length === 1) return 0;
        const position = Math.floor(randomUnit(random) * (songs.length - (current >= 0 && current < songs.length ? 1 : 0)));
        if (current < 0 || current >= songs.length) return Math.min(position, songs.length - 1);
        return position >= current ? position + 1 : position;
    }

    /** 按权重一次有界扫描，返回原候选数组下标。 */
    function chooseWeighted(songs, current = -1, random = Math.random, counts = {}, extras = {}) {
        if (!Array.isArray(songs) || songs.length === 0) return -1;
        if (songs.length === 1) return 0;
        let total = 0;
        for (let index = 0; index < songs.length; index++) {
            if (index === current) continue;
            total += weight(songs[index], counts, extras);
        }
        if (!total) return current >= 0 && current < songs.length ? current : 0;
        let point = randomUnit(random) * total;
        let last = -1;
        for (let index = 0; index < songs.length; index++) {
            if (index === current) continue;
            last = index;
            point -= weight(songs[index], counts, extras);
            if (point < 0) return index;
        }
        return last >= 0 ? last : (current >= 0 && current < songs.length ? current : 0);
    }

    return { key, valid, weight, chooseUniform, chooseWeighted };
});
