/** 浮动顶部装配；子组件在业务脚本执行前同步挂载。 @author jingyh @date 2026-10-10 */
(() => {
    /**
     * 将原列表滚动入口映射到承载顶部占位的页面，弹窗仍使用原容器。
     * @param {string} id 原滚动容器标识。
     * @returns {HTMLElement|null} 当前布局实际滚动的节点。
     * @author jingyh
     */
    window.getMusicScrollContainer = id => {
        const targets = { 'search-results': 'view-search', 'artist-detail-content': 'view-search', 'songlist-grid': 'view-songlist', 'sl-detail-list': 'songlist-detail-view', 'lm-list-container': 'view-localmusic', 'lb-songs-container': 'view-leaderboard', 'lb-songs-list': 'view-leaderboard' };
        if (id === 'settings-content' && window.matchMedia('(max-width: 959px)').matches) return document.getElementById('settings-shell');
        return document.getElementById(targets[id] || id);
    };
    const container = document.getElementById('music-top-bar');
    if (!container) return;
    container.innerHTML = '<div class="top-search-host"></div><div class="top-actions-host"></div>';
    window.LibrarySearchBox.mount(container.firstElementChild);
    window.TopAccountActions.mount(container.lastElementChild);
})();
