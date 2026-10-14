/**
 * 媒体缓存设置适配器。页面只需把 data-media-cache-settings 容器交给 mount，
 * 本模块不会扫描 Blob 或修改用户歌单/服务器歌词缓存。
 * @author jingyh
 */
(function (root) {
    'use strict';

    const account = () => root.getUserAuthHeaders?.()['x-user-name'] || root.MusicExperience?.account || '_open';
    const scope = () => ({ server: root.location?.origin || '', account: account() });
    let activeScope = scope();
    const enabled = () => root.settings || {};
    const formatSize = bytes => {
        const value = Number(bytes || 0);
        if (value < 1024) return value + ' B';
        if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
        if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB';
        return (value / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    };
    const setText = (container, text, error = false) => {
        const target = container?.querySelector?.('[data-media-cache-status]');
        if (target) { target.textContent = text; target.classList.toggle('text-red-500', error); }
    };
    const updateStats = async container => {
        if (!root.MediaCache?.stats) return null;
        try {
            const data = await root.MediaCache.stats(scope());
            setText(container, `封面 ${formatSize(data.coverBytes)} / ${data.coverEntries} 条；歌词 ${formatSize(data.lyricsBytes)} / ${data.lyricsEntries} 条`);
            return data;
        } catch (error) { setText(container, '媒体缓存统计暂不可用', true); return null; }
    };
    const clear = async (container, kind) => {
        if (!root.MediaCache?.clear || container?.dataset.busy === 'true') return 0;
        container.dataset.busy = 'true';
        try {
            const count = await root.MediaCache.clear(scope(), kind);
            setText(container, `已清理 ${count} 条媒体缓存`);
            await updateStats(container);
            return count;
        } catch (error) { setText(container, '清理失败，播放流程未受影响', true); return 0; }
        finally { container.dataset.busy = 'false'; }
    };
    const mount = container => {
        if (!container || container.dataset.mediaCacheMounted === 'true') return () => {};
        container.dataset.mediaCacheMounted = 'true';
        const settings = enabled();
        const lyricToggle = container.querySelector('[data-media-cache-lyric]');
        const coverToggle = container.querySelector('[data-media-cache-cover]');
        const cleanupToggle = container.querySelector('[data-media-cache-clear-on-exit]');
        if (lyricToggle) { lyricToggle.checked = settings.enableLyricCache !== false; lyricToggle.addEventListener('change', () => root.updateSetting?.('enableLyricCache', lyricToggle.checked)); }
        if (coverToggle) { coverToggle.checked = settings.enableCoverLocalCache !== false; coverToggle.addEventListener('change', () => root.updateSetting?.('enableCoverLocalCache', coverToggle.checked)); }
        if (cleanupToggle) { cleanupToggle.checked = settings.clearMediaCacheOnLogout === true; cleanupToggle.addEventListener('change', () => root.updateSetting?.('clearMediaCacheOnLogout', cleanupToggle.checked)); }
        container.querySelector('[data-media-cache-clear-cover]')?.addEventListener('click', () => clear(container, 'cover'));
        container.querySelector('[data-media-cache-clear-lyrics]')?.addEventListener('click', () => clear(container, 'lyrics'));
        container.querySelector('[data-media-cache-clear-all]')?.addEventListener('click', () => clear(container));
        void updateStats(container);
        return () => { container.dataset.mediaCacheMounted = 'false'; };
    };
    const descriptor = { scope, formatSize, updateStats, clear, mount };
    root.MediaCacheSettings = descriptor;
    root.addEventListener?.('music-account-changed', () => {
        const previous = activeScope, next = scope();
        root.MediaCache?.disposeScope?.(previous);
        if (enabled().clearMediaCacheOnLogout === true && root.MediaCache?.clear) void root.MediaCache.clear(previous);
        activeScope = next;
        root.document?.querySelectorAll?.('[data-media-cache-settings]').forEach(updateStats);
    });
})(typeof window !== 'undefined' ? window : globalThis);
