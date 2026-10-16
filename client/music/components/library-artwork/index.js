/** 歌手头像与音乐封面缓存组件；按账号隔离，使用现有认证请求。 @author jingyh @date 2026-10-10 */
(() => {
    const versions = new WeakMap();
    let generation = 0;
    const resolved = new Map();
    const waiting = new Map();
    // 候选 URL 的远程参数和令牌不参与图片身份，播放补图后仅更新同曲占位图。
    const key = value => {
        if (!value || value.includes('/assets/logo.svg')) return null;
        const url = new URL(value, location.origin);
        for (const name of ['token', 'url', 'password', 'auth']) url.searchParams.delete(name);
        url.searchParams.sort();
        return url.toString();
    };
    const safeUrl = value => typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(value) ? value : null;
    window.LibraryArtwork = {
        /** 接入已有延迟加载图片；候选顺序与播放栏相同。 */
        bind(image, song) {
            const resolve = () => window.MusicExperience?.coverCandidates(song) || [];
            if (window.ImageLoader) window.ImageLoader.observe(image, resolve, { src: image.dataset.src });
            else this.attach(image, resolve());
        },
        async attach(image, value) {
            const revision = {}, epoch = generation, origin = image.dataset.src;
            versions.set(image, revision);
            const candidates = (Array.isArray(value) ? value : [value]).map(safeUrl).filter(Boolean);
            for (const candidate of candidates) {
                const id = key(candidate);
                if (!id) continue;
                if (waiting.size > 3000) waiting.clear();
                const entries = waiting.get(id) || new Set();
                for (const entry of entries) {
                    const target = entry.image.deref();
                    if (!target || versions.get(target) !== entry.revision) entries.delete(entry);
                }
                // WeakRef 避免已移除的列表行被封面组件长期持有。
                entries.add({ image: new WeakRef(image), revision });
                waiting.set(id, entries);
            }
            candidates.push('/music/assets/logo.svg');
            let index = 0;
            // 在线图片直接使用 img，避免 fetch 跨域失败；本地接口通过当前账号令牌认证。
            const next = () => {
                if (versions.get(image) !== revision || generation !== epoch) return;
                let url = candidates[index++];
                if (!url) { image.onerror = null; return; }
                if (url.startsWith('/api/music/')) {
                    const parsed = new URL(url, location.origin), auth = window.getUserAuthHeaders?.() || {};
                    parsed.searchParams.delete('token');
                    if (auth['x-user-token']) parsed.searchParams.set('token', auth['x-user-token']);
                    url = parsed.pathname + parsed.search;
                }
                image.classList?.toggle('is-placeholder', url.includes('/assets/logo.svg'));
                image.dataset.src = url;
                image.src = url;
            };
            image.onerror = next;
            image.onload = () => {
                if (versions.get(image) === revision && generation === epoch) {
                    const placeholder = image.src.includes('/assets/logo.svg');
                    image.classList?.toggle('is-placeholder', placeholder);
                    if (!placeholder) {
                        const loaded = image.getAttribute('src');
                        if (resolved.size > 3000) resolved.clear();
                        if (origin && candidates.some(candidate => key(candidate) && key(candidate) === key(origin))) resolved.set(origin, loaded);
                        for (const candidate of candidates) {
                            const id = key(candidate), entries = waiting.get(id);
                            if (!entries) continue;
                            waiting.delete(id);
                            for (const entry of entries) {
                                const target = entry.image.deref(), expected = entry.revision;
                                if (!target) continue;
                                if (target === image || versions.get(target) !== expected || !target.src.includes('/assets/logo.svg')) continue;
                                target.src = loaded;
                                target.classList?.remove('is-placeholder');
                            }
                        }
                    }
                }
            };
            next();
        },
        /** 已成功加载过的封面地址；列表重绘时直接复用，避免占位图闪烁。 */
        known(source) { return source ? resolved.get(source) || null : null; },
        clear() { generation++; resolved.clear(); waiting.clear(); },
    };
    window.addEventListener('music-account-changed', () => window.LibraryArtwork.clear());
})();
