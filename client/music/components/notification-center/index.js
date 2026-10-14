/** 消息中心：顶部铃铛、未读红点、下拉列表、单条已读与一键已读；已读即由服务端删除。 @author jingyh */
(() => {
    const items = new Map();
    const dismissed = new Set();
    let loaded = false;
    const levels = { success: ['fa-check', 'success'], error: ['fa-exclamation', 'error'], warn: ['fa-exclamation-triangle', 'warn'], info: ['fa-info', 'info'] };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const signedIn = () => !!window.AccountSession?.getToken?.();
    const headers = () => ({ 'Content-Type': 'application/json', ...window.getUserAuthHeaders?.() });
    const sorted = () => [...items.values()].sort((left, right) => right.createdAt - left.createdAt);

    /** 只接受站内链接，避免消息正文把用户带到外部地址。 */
    function safeLink(link) {
        if (!link) return '';
        try { const url = new URL(link, location.origin); return url.origin === location.origin ? url.pathname + url.search + url.hash : ''; } catch { return ''; }
    }
    function ago(time) {
        const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
        if (seconds < 60) return '刚刚';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
        return new Date(time).toLocaleDateString();
    }
    function render() {
        const list = sorted();
        const trigger = document.getElementById('header-notice-trigger');
        const panel = document.getElementById('header-notice-menu');
        trigger?.classList.toggle('has-unread', list.length > 0);
        trigger?.setAttribute('aria-label', list.length ? `消息中心，${list.length} 条未读` : '消息中心');
        if (!panel || !panel.dataset.ready) return;
        const body = panel.querySelector('.notice-list');
        panel.querySelector('.notice-read-all').disabled = !list.length;
        panel.querySelector('.notice-subtitle').textContent = list.length ? `${list.length} 条未读` : '没有未读消息';
        if (!list.length) {
            body.innerHTML = '<div class="notice-empty"><i class="far fa-bell-slash"></i><p>暂无新消息</p></div>';
            return;
        }
        body.innerHTML = list.map(item => {
            const [icon, tone] = levels[item.level] || levels.info;
            return `<div class="notice-item" role="listitem" data-notice-id="${escape(item.id)}" tabindex="0">
                <span class="notice-icon is-${tone}"><i class="fas ${icon}"></i></span>
                <span class="notice-content"><strong>${escape(item.title)}</strong>${item.message ? `<span class="notice-message">${escape(item.message)}</span>` : ''}<time>${ago(item.createdAt)}</time></span>
                <button type="button" class="notice-read" data-notice-read="${escape(item.id)}" title="标为已读" aria-label="标为已读"><i class="fas fa-check"></i></button>
            </div>`;
        }).join('');
    }
    async function post(body) {
        const response = await fetch('/api/user/notifications/read', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
    }
    /** 先从界面移除，再通知服务端删除；失败时重新读取，保持两端一致。 */
    async function read(ids) {
        ids.forEach(id => { items.delete(id); dismissed.add(id); });
        render();
        try { if (signedIn()) await post({ ids }); } catch { void refresh(); }
    }
    async function readAll() {
        const ids = [...items.keys()];
        if (!ids.length) return;
        ids.forEach(id => dismissed.add(id)); items.clear(); render();
        try { if (signedIn()) await post({ all: true }); } catch { void refresh(); }
    }
    async function refresh() {
        if (!signedIn()) { items.clear(); render(); return; }
        try {
            const response = await fetch('/api/user/notifications', { headers: headers(), cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            items.clear();
            for (const item of data.items || []) if (!dismissed.has(item.id)) items.set(item.id, { ...item, link: safeLink(item.link) });
            loaded = true; render();
        } catch { }
    }
    /** WebSocket 推送的新消息直接进入列表；已读过的重复推送被忽略。 */
    function add(notice) {
        if (!notice?.id || dismissed.has(notice.id)) return;
        items.set(notice.id, { id: notice.id, level: notice.level || 'info', title: notice.title || '', message: notice.message, link: safeLink(notice.link), createdAt: notice.createdAt || Date.now() });
        render();
    }
    function mount() {
        const panel = document.getElementById('header-notice-menu');
        if (!panel || panel.dataset.ready) return;
        panel.dataset.ready = '1';
        panel.innerHTML = `<header class="notice-header"><div><h3>消息中心</h3><p class="notice-subtitle"></p></div>
            <button type="button" class="notice-read-all"><i class="fas fa-check-double"></i>全部已读</button></header>
            <div class="notice-list" role="list"></div>`;
        panel.addEventListener('click', event => {
            if (event.target.closest('.notice-read-all')) { void readAll(); return; }
            const button = event.target.closest('[data-notice-read]');
            if (button) { event.stopPropagation(); void read([button.dataset.noticeRead]); return; }
            const row = event.target.closest('.notice-item');
            if (!row) return;
            const link = items.get(row.dataset.noticeId)?.link;
            void read([row.dataset.noticeId]);
            if (link) location.href = link;
        });
        panel.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.classList?.contains('notice-item')) event.target.click(); });
        document.getElementById('header-notice-trigger')?.addEventListener('click', () => { render(); if (!loaded) void refresh(); });
        render();
        window.ClientTransport?.on?.('notify', add);
        window.ClientTransport?.on?.('ready', () => void refresh());
        window.addEventListener('music-account-changed', () => { dismissed.clear(); loaded = false; void refresh(); });
        setInterval(() => { if (!document.hidden && !panel.classList.contains('hidden')) render(); }, 60000);
        void refresh();
    }
    window.NotificationCenter = { add, read, readAll, refresh, mount, get count() { return items.size; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
    window.addEventListener('load', mount, { once: true });
})();