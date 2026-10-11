/** 歌词、均衡器和评论的独立页面呈现；共用原控件与业务，桌面仍使用弹框。 @author jingyh */
(function () {
    const byId = id => document.getElementById(id);
    const mobile = window.matchMedia('(max-width: 767px)');
    const definitions = {
        equalizer: ['sound-effects-modal', 'sound-effects-content', '均衡器与音效'],
        comments: ['comment-modal', 'comment-modal-content', '歌曲评论'],
    };
    let active = null, pendingReturn = false, closingTimer = null, pointer = null;
    const host = document.createElement('section');
    host.id = 'player-feature-page'; host.hidden = true;
    host.innerHTML = '<header class="player-feature-header"><button type="button" aria-label="返回播放界面"><i class="fas fa-chevron-left" aria-hidden="true"></i></button><h2></h2></header><div class="player-feature-body"></div>';
    document.body.append(host);
    host.querySelector('button').addEventListener('click', () => close());

    /** 栈状态仅增加子页面标记，返回手势保留底层播放详情。 */
    function navigate(name) {
        window.history.pushState({ ...window.history.state, playerFeature: name }, '');
    }

    function open(name) {
        if (!definitions[name] || !mobile.matches) return false;
        if (active?.name === name) return true;
        if (active || pendingReturn || host.classList.contains('is-closing')) return false;
        const [modalId, panelId, title] = definitions[name];
        const panel = byId(panelId), modal = byId(modalId);
        const marker = document.createComment('独立功能页原位置');
        panel.before(marker);
        active = { name, panel, modal, marker, focus: document.activeElement };
        host.dataset.feature = name;
        host.querySelector('h2').textContent = title;
        host.querySelector('.player-feature-body').append(panel);
        host.hidden = false;
        document.body.classList.add('player-feature-open');
        void host.offsetWidth;
        host.classList.add('is-open');
        navigate(name);
        host.querySelector('button').focus({ preventScroll: true });
        return true;
    }

    /** 全屏歌词复用同步滚动节点，切换时不重新创建歌词或改动播放进度。 */
    function openLyrics() {
        if (!mobile.matches || !window.playerDetailView.open || active || pendingReturn) return;
        clearTimeout(closingTimer);
        const view = byId('view-player-detail');
        active = { name: 'lyrics', focus: document.activeElement };
        view.classList.remove('mobile-lyrics-closing');
        view.classList.add('mobile-lyrics-open');
        byId('lyrics-wrapper').setAttribute('aria-label', '全屏歌词，点击返回播放界面');
        byId('lyrics-wrapper').tabIndex = 0;
        byId('lyrics-wrapper').focus({ preventScroll: true });
        navigate('lyrics');
        requestAnimationFrame(() => window.scrollToActiveLine?.(true));
    }

    /** 先播放退出动效，再还原实际内容节点；恢复时不丢失原监听器和状态。 */
    function close(name, historyBack = true, animate = true) {
        if (!active || (name && active.name !== name)) return false;
        const previous = active;
        active = null;
        if (previous.name === 'lyrics') {
            const view = byId('view-player-detail');
            view.classList.remove('mobile-lyrics-open');
            if (animate) view.classList.add('mobile-lyrics-closing');
            clearTimeout(closingTimer);
            closingTimer = setTimeout(() => view.classList.remove('mobile-lyrics-closing'), animate ? 260 : 0);
            byId('lyrics-wrapper').removeAttribute('tabindex');
        } else {
            host.classList.remove('is-open');
            host.classList.toggle('is-closing', animate);
            const restore = () => {
                previous.marker.replaceWith(previous.panel);
                previous.modal.classList.add('hidden');
                previous.modal.classList.remove('flex');
                previous.panel.classList.add('translate-y-10', 'opacity-0');
                previous.panel.classList.remove('translate-y-0', 'opacity-100');
                host.hidden = true;
                host.classList.remove('is-closing');
                document.body.classList.remove('player-feature-open');
            };
            clearTimeout(closingTimer);
            if (animate) closingTimer = setTimeout(restore, 260);
            else restore();
        }
        if (historyBack && window.history.state?.playerFeature === previous.name) {
            pendingReturn = true;
            window.history.back();
        }
        previous.focus?.focus({ preventScroll: true });
        return true;
    }

    function handlePopState() {
        if (pendingReturn) { pendingReturn = false; return true; }
        return close(undefined, false);
    }

    /** 捕获点击拦截旧歌词跳转；拖动或滚动只浏览歌词，不退出页面。 */
    const lyrics = byId('lyrics-wrapper');
    const cover = byId('detail-cover');
    const syncLyricBackground = () => {
        if (cover?.src) lyrics.style.setProperty('--player-lyric-artwork', `url(${JSON.stringify(cover.src)})`);
    };
    if (cover) new MutationObserver(syncLyricBackground).observe(cover, { attributes: true, attributeFilter: ['src'] });
    syncLyricBackground();
    lyrics.addEventListener('pointerdown', event => { pointer = { x: event.clientX, y: event.clientY, moved: false }; });
    lyrics.addEventListener('pointermove', event => {
        if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) pointer.moved = true;
    });
    lyrics.addEventListener('pointercancel', () => { if (pointer) pointer.moved = true; });
    lyrics.addEventListener('click', event => {
        if (active?.name !== 'lyrics') return;
        event.stopImmediatePropagation();
        event.preventDefault();
        if (!pointer?.moved) close('lyrics');
        pointer = null;
    }, true);
    document.addEventListener('keydown', event => {
        if (active && (event.key === 'Escape' || (active.name === 'lyrics' && (event.key === 'Enter' || event.key === ' ')))) {
            event.preventDefault(); close();
        }
    });
    mobile.addEventListener('change', () => {
        if (!mobile.matches) close(undefined, true, false);
    });
    window.PlayerFeaturePages = { open, openLyrics, close, handlePopState, dismiss: () => close(undefined, false, false) };
})();
