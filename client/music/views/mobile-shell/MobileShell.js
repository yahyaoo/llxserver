/** 手机独立导航页，复用原菜单节点与设置表单，避免歌单状态分叉。 @author jingyh */
(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    const placements = [];
    let mounted = false;
    let active = 'mobile-library';
    const byId = id => document.getElementById(id);
    const navButton = (target, icon, label) => `<button type="button" data-mobile-tab="${target}" onclick="MobileShell.open('${target}')" aria-label="${label}"><i class="${icon}" aria-hidden="true"></i><span>${label}</span></button>`;

    /** 挂载独立页面，移动已有导航节点，窗口变宽时原样还原。 */
    function mount() {
        if (mounted) return;
        const host = byId('view-search')?.parentElement;
        if (!host) return;
        mounted = true;
        const pages = document.createElement('div');
        pages.id = 'mobile-pages';
        pages.innerHTML = `<section id="view-mobile-home" class="mobile-page hidden"><div class="mobile-home-placeholder"><img src="assets/logo.svg" alt="洛洛雪音乐"><h2>首页</h2><p>音乐首页即将上线</p><button type="button" onclick="MobileShell.open('mobile-library')">打开音乐库 <i class="fas fa-arrow-right"></i></button></div></section>
            <section id="view-mobile-library" class="mobile-page hidden"><div class="mobile-library-content"><ul id="mobile-library-general" class="mobile-card mobile-menu-list"></ul><ul id="mobile-library-favorites" class="mobile-card mobile-menu-list"></ul><ul id="mobile-library-dislike" class="mobile-card mobile-menu-list"></ul><ul id="mobile-library-playlists" class="mobile-card mobile-menu-list"></ul></div></section>
            <section id="view-mobile-settings" class="mobile-page hidden"><button type="button" class="mobile-profile mobile-card" onclick="MobileShell.settings('account')"><span id="mobile-account-avatar" class="mobile-profile-avatar"><i class="fas fa-user"></i></span><span class="mobile-profile-copy"><strong id="mobile-account-name">我的账号</strong><small id="mobile-account-login"></small></span><i class="fas fa-chevron-right"></i></button><div id="mobile-settings-groups"></div><div class="mobile-card"><button type="button" class="mobile-menu-row" onclick="openAccountPasswordDialog()"><i class="fas fa-key"></i><span>修改密码</span><i class="fas fa-chevron-right"></i></button><button type="button" class="mobile-menu-row" onclick="handleHeaderLogout(event)"><i class="fas fa-sign-out-alt"></i><span>退出登录</span><i class="fas fa-chevron-right"></i></button></div></section>`;
        host.append(pages);
        const header = document.createElement('header');
        header.id = 'mobile-page-header';
        header.innerHTML = `<button type="button" id="mobile-back" onclick="MobileShell.back()" aria-label="返回音乐库"><i class="fas fa-chevron-left"></i></button><h1 id="mobile-page-title">音乐库</h1><button type="button" onclick="MobileShell.open('search')" aria-label="在线搜索"><i class="fas fa-search"></i></button>`;
        document.querySelector('.music-shell').append(header);
        const dock = document.createElement('nav');
        dock.id = 'mobile-bottom-nav'; dock.setAttribute('aria-label', '手机导航');
        dock.innerHTML = navButton('mobile-home', 'fas fa-home', '首页') + navButton('mobile-library', 'fas fa-compact-disc', '音乐库') + navButton('search', 'fas fa-search', '搜索') + navButton('mobile-settings', 'fas fa-user', '设置与账号') + `<button type="button" class="mobile-now-playing" onclick="toggleLyrics()" aria-label="打开播放详情"><img id="mobile-nav-cover" src="assets/logo.svg" alt="当前歌曲封面"><span class="mobile-playing-indicator" aria-hidden="true"></span></button>`;
        document.body.append(dock);
        const source = byId('main-navigation').firstElementChild;
        [...source.children].forEach(li => {
            const link = li.querySelector('[id^="tab-"]');
            if (link?.id === 'tab-search') return;
            const target = link?.id === 'tab-favorites' ? 'favorites' : link?.id === 'tab-dislike' ? 'dislike' : li.querySelector('#playlist-lists-container') ? 'playlists' : 'general';
            const marker = document.createComment('mobile-navigation-origin');
            li.before(marker); placements.push({ li, marker });
            byId('mobile-library-' + target).append(li);
        });
        if (typeof SETTINGS_NAVIGATION !== 'undefined') {
            SETTINGS_NAVIGATION.forEach(group => {
                const card = document.createElement('div'); card.className = 'mobile-card';
                group.items.forEach(item => {
                    const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-menu-row';
                    button.innerHTML = `<i class="fas ${item.icon}" aria-hidden="true"></i><span>${item.label}</span><i class="fas fa-chevron-right" aria-hidden="true"></i>`;
                    button.addEventListener('click', () => settings(item.id)); card.append(button);
                });
                byId('mobile-settings-groups').append(card);
            });
        }
        pages.querySelectorAll('.mobile-menu-row').forEach(button => button.setAttribute('aria-label', button.textContent.trim()));
        pages.querySelectorAll('i').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
        const audio = byId('audio-player');
        audio?.addEventListener('play', syncPlayer); audio?.addEventListener('pause', syncPlayer);
        new MutationObserver(syncPlayer).observe(byId('player-cover'), { attributes: true, attributeFilter: ['src'] });
        new MutationObserver(syncProfile).observe(byId('header-account-trigger'), { childList: true, subtree: true });
        syncProfile(); syncPlayer();
        let syncPending = false;
        const scheduleSync = () => {
            if (syncPending) return;
            syncPending = true;
            requestAnimationFrame(() => { syncPending = false; sync(); });
        };
        const viewObserver = new MutationObserver(scheduleSync);
        host.querySelectorAll('[id^="view-"]').forEach(view => viewObserver.observe(view, { attributes: true, attributeFilter: ['class'] }));
        new MutationObserver(scheduleSync).observe(byId('settings-section-title'), { childList: true });
    }

    /** 窄屏使用同一份歌单树，宽屏还原侧栏位置；保留节点上的事件与排序实例。 */
    function resize() {
        if (mobile.matches) {
            mount();
            placements.forEach(({ li }) => {
                const link = li.querySelector('[id^="tab-"]');
                const target = link?.id === 'tab-favorites' ? 'favorites' : link?.id === 'tab-dislike' ? 'dislike' : li.querySelector('#playlist-lists-container') ? 'playlists' : 'general';
                byId('mobile-library-' + target).append(li);
            });
            if (!document.querySelector('.music-shell [id^="view-"]:not(.hidden)') || active === 'mobile-library') open('mobile-library');
            sync();
        } else if (mounted) {
            placements.forEach(({ li, marker }) => marker.after(li));
            byId('mobile-pages').querySelectorAll('[id^="view-"]').forEach(n => n.classList.add('hidden'));
            if (!document.querySelector('.music-shell [id^="view-"]:not(.hidden)')) window.switchTab('localmusic');
        }
    }

    function open(target) {
        if (!mobile.matches) return;
        active = target;
        window.switchTab(target);
        sync();
    }

    function settings(section) {
        window.switchTab('settings');
        window.selectSettingsSection(section);
        sync('settings');
    }

    /** 收藏沿用搜索结果容器，依据搜索范围区分在线搜索和音乐库。 */
    function navigationTarget(view, scope) {
        if (view === 'settings') return 'mobile-settings';
        if (view === 'search' && scope === 'network') return 'search';
        return ['mobile-home', 'mobile-settings'].includes(view) ? view : 'mobile-library';
    }

    /** 由实际显示页面决定导航选中态，兼容歌单、搜索及播放器原有入口。 */
    function sync(target) {
        if (!mobile.matches || !mounted) return;
        const view = target || document.querySelector('.music-shell [id^="view-"]:not(.hidden)')?.id.replace('view-', '') || active;
        active = view;
        const isOnlineSearch = view === 'search' && (typeof currentSearchScope === 'undefined' || currentSearchScope === 'network') && !byId('tab-favorites')?.classList.contains('active-tab');
        const selected = navigationTarget(view, isOnlineSearch ? 'network' : 'local_list');
        byId('mobile-bottom-nav').querySelectorAll('[data-mobile-tab]').forEach(button => {
            const current = button.dataset.mobileTab === selected;
            button.classList.toggle('is-active', current); button.setAttribute('aria-current', current ? 'page' : 'false');
        });
        const titles = { 'mobile-home': '首页', 'mobile-library': '音乐库', 'mobile-settings': '设置', search: '在线搜索', settings: '设置', localmusic: '音乐库', songlist: '在线歌单', leaderboard: '排行榜', recent: '最近播放', downloads: '下载管理' };
        byId('mobile-page-title').textContent = view === 'settings' ? byId('settings-section-title')?.textContent || '设置' : view === 'search' && !isOnlineSearch ? byId('page-title')?.textContent || '音乐库' : titles[view] || '音乐库';
        byId('mobile-back').style.visibility = view.startsWith('mobile-') ? 'hidden' : 'visible';
        document.body.classList.toggle('mobile-settings-detail', view === 'settings');
        syncProfile();
    }

    function back() { open(active === 'settings' ? 'mobile-settings' : 'mobile-library'); }
    function syncProfile() {
        if (!mounted) return;
        byId('mobile-account-name').textContent = window.accountProfileNickname || byId('header-username')?.textContent || '我的账号';
        byId('mobile-account-login').textContent = byId('account-username')?.value || '';
        const image = document.querySelector('#header-account-trigger .header-avatar img');
        const avatar = byId('mobile-account-avatar');
        if (image && avatar.dataset.url !== image.src) { avatar.replaceChildren(image.cloneNode()); avatar.dataset.url = image.src; }
        if (!image && avatar.dataset.url) { avatar.innerHTML = '<i class="fas fa-user"></i>'; delete avatar.dataset.url; }
    }
    function syncPlayer() {
        if (!mounted) return;
        const cover = byId('player-cover');
        if (cover?.src && byId('mobile-nav-cover').src !== cover.src) byId('mobile-nav-cover').src = cover.src;
        byId('mobile-bottom-nav').classList.toggle('is-playing', !byId('audio-player').paused);
    }
    window.MobileShell = { open, settings, back, sync, resize };
    mobile.addEventListener('change', resize);
    document.addEventListener('DOMContentLoaded', () => { resize(); });
})();
