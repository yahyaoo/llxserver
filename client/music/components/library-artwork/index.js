/** 歌手头像与音乐封面缓存组件；按账号隔离，使用现有认证请求。 @author jingyh @date 2026-10-10 */
(() => {
    const pending = new Map();
    let account = '';
    const safeUrl = value => typeof value === 'string' && /^(https?:\/\/|\/api\/music\/)/.test(value) ? value : null;
    window.LibraryArtwork = {
        async attach(image, value) {
            image.src = '/music/assets/logo.svg';
            image.onerror = () => { image.onerror = null; image.src = '/music/assets/logo.svg'; };
            const url = safeUrl(value);
            if (!url) return;
            const owner = window.getUserAuthHeaders?.()['x-user-name'] || '_open';
            if (owner !== account) this.clear();
            account = owner;
            const key = owner + ':' + url;
            if (!pending.has(key)) {
                pending.set(key, (async () => {
                    const response = await fetch(url, { headers: url.startsWith('/') ? window.getUserAuthHeaders() : {} });
                    if (!response.ok) throw new Error('封面不可用');
                    const blob = await response.blob();
                    if (!blob.type.startsWith('image/')) throw new Error('封面格式不正确');
                    return URL.createObjectURL(blob);
                })().catch(() => null));
            }
            const source = await pending.get(key);
            if (source && account === owner && image.isConnected) image.src = source;
            // 限制内存缓存，长时间检索不会无限积累图片。
            if (pending.size > 160) { const first = pending.keys().next().value; pending.get(first).then(url => { if (url) URL.revokeObjectURL(url); }); pending.delete(first); }
        },
        clear() { pending.forEach(task => task.then(url => { if (url) URL.revokeObjectURL(url); })); pending.clear(); },
    };
    window.addEventListener('music-account-changed', () => window.LibraryArtwork.clear());
})();
