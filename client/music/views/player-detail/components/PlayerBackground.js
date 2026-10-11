/** 播放页独立背景，隔离头像异步加载与外部毛玻璃设置。 @author jingyh @date 2026-10-10 */
(function () {
    class PlayerBackground {
        constructor(image) {
            this.image = image;
            this.revision = 0;
            this.key = null;
            this.lookupCache = new Map();
        }

        /** 保留旧背景值，新旧配置均能安全应用；未知模式沿用透明页面外观。 */
        static normalizeMode(mode) {
            return ['theme', 'artist', 'blur', 'solid', 'dark'].includes(mode) ? mode : 'theme';
        }

        /** 清除头像并使在途请求失效，防止切换背景模式后旧图片重新出现。 */
        clear() {
            ++this.revision;
            this.key = null;
            this.image.hidden = true;
            this.image.onload = this.image.onerror = null;
            this.image.removeAttribute('src');
        }

        /** 仅接受图片地址；歌曲封面不作为歌手头像的替代。 */
        static avatarUrl(song) {
            const candidates = [song?.artistAvatar, song?.artistImageUrl, song?.singerAvatar, song?.artist?.avatar,
                song?.artist?.picUrl, song?.singerInfo?.picUrl, song?.meta?.artistAvatar];
            return candidates.find(value => typeof value === 'string' && /^(https?:\/\/|\/api\/music\/|blob:)/.test(value)) || null;
        }

        /** 复用已有歌手搜索，仅取同名歌手；缓存按账号隔离，不影响歌曲或音源选择。 */
        async lookupAvatar(singer, source, owner) {
            const key = JSON.stringify([owner, singer, source]);
            if (!this.lookupCache.has(key)) {
                const task = (async () => {
                    try {
                        const url = '/api/music/search?type=singer&page=1&limit=5&source=' + source + '&name=' + encodeURIComponent(singer);
                        const response = await fetch(url, { headers: window.getUserAuthHeaders?.() || {}, signal: AbortSignal.timeout(5000) });
                        if (!response.ok) return null;
                        const list = await response.json();
                        const exact = Array.isArray(list) && list.find(item => item.name?.trim() === singer);
                        return exact ? PlayerBackground.avatarUrl({ artistAvatar: exact.picUrl || exact.img || exact.pic }) : null;
                    } catch { return null; }
                })();
                this.lookupCache.set(key, task);
                if (this.lookupCache.size > 40) this.lookupCache.delete(this.lookupCache.keys().next().value);
            }
            return this.lookupCache.get(key);
        }

        /** 本地头像沿用认证缓存；远程头像允许浏览器直接显示，避免跨域读取失败导致丢图。 */
        async imageSource(url) {
            if (!url) return null;
            if (url.startsWith('blob:')) return url;
            const probe = document.createElement('img');
            probe.hidden = true;
            document.body.append(probe);
            try {
                if (window.LibraryArtwork) await window.LibraryArtwork.attach(probe, url);
            } catch {
                // 本地接口失败后继续尝试在线歌手头像，不影响播放。
            } finally { probe.remove(); }
            if (probe.src && !probe.src.includes('/assets/logo.svg')) return probe.src;
            return /^https?:\/\//.test(url) ? url : null;
        }

        /** 按歌手与账号加载现有头像，过期请求不得覆盖新歌的背景。 */
        async update(song, force = false) {
            const avatar = PlayerBackground.avatarUrl(song);
            const singer = (song?.singer || '').split(/[、&,，]| \/ /)[0].trim();
            const owner = window.getUserAuthHeaders?.()['x-user-name'] || '_open';
            // 现有网易和 QQ 歌手搜索提供头像，其余歌曲来源用网易查询背景素材。
            const source = ['wy', 'tx'].includes(song?.source) ? song.source : 'wy';
            const key = JSON.stringify([owner, singer, avatar, source]);
            if (!force && key === this.key) return;
            this.key = key;
            const revision = ++this.revision;
            const image = this.image;
            image.hidden = true;
            image.removeAttribute('src');
            image.onload = image.onerror = null;
            if (!avatar && !singer) return;
            const current = () => revision === this.revision && owner === (window.getUserAuthHeaders?.()['x-user-name'] || '_open');
            let url = await this.imageSource(avatar || '/api/music/library/avatar?name=' + encodeURIComponent(singer));
            if (!current()) return;
            if (!url && singer) {
                const online = await this.lookupAvatar(singer, source, owner);
                if (!current()) return;
                url = await this.imageSource(online);
            }
            if (!current() || !url) return;
            image.onload = () => { if (current()) image.hidden = false; };
            image.onerror = () => { if (current()) image.hidden = true; };
            image.src = url;
        }
    }
    window.PlayerBackground = PlayerBackground;
})();
