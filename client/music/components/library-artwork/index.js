/** 歌手头像与音乐封面缓存组件；按账号隔离，使用现有认证请求。 @author jingyh @date 2026-10-10 */
(() => {
    const versions = new WeakMap();
    let generation = 0;
    const safeUrl = value => typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(value) ? value : null;
    window.LibraryArtwork = {
        /** 接入已有延迟加载图片；候选顺序与播放栏相同。 */
        bind(image, song) {
            const candidates = window.MusicExperience.coverCandidates(song);
            image.dataset.artworkCandidates = JSON.stringify(candidates);
            const url = candidates[0] || '/music/assets/logo.svg';
            if (image.dataset.src) image.dataset.src = url;
            else this.attach(image, candidates);
            let index = 0;
            image.onerror = () => {
                const next = candidates[++index] || '/music/assets/logo.svg';
                if (next.includes('/assets/logo.svg')) image.onerror = null;
                image.classList?.toggle('is-placeholder', next.includes('/assets/logo.svg')); image.src = next;
            };
        },
        async attach(image, value) {
            const revision = {}, epoch = generation;
            versions.set(image, revision);
            const candidates = (Array.isArray(value) ? value : [value]).map(safeUrl).filter(Boolean);
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
                image.src = url;
            };
            image.onerror = next;
            image.onload = () => {
                if (versions.get(image) === revision && generation === epoch) image.classList?.toggle('is-placeholder', image.src.includes('/assets/logo.svg'));
            };
            next();
        },
        clear() { generation++; },
    };
    window.addEventListener('music-account-changed', () => window.LibraryArtwork.clear());
})();
