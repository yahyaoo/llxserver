/** 手机歌曲行收起次要操作，打开菜单时移动原按钮，保留权限与点击事件。 @author yahyaoo */
(function () {
    const mobile = window.matchMedia('(max-width: 767px)');
    let active = null;
    const menu = document.createElement('div');
    menu.id = 'mobile-song-menu'; menu.hidden = true;
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '歌曲操作');
    document.body.append(menu);

    function close(focus = false) {
        if (!active) return;
        const previous = active; active = null;
        previous.moves.forEach(({ button, marker, label }) => {
            label.remove(); button.removeAttribute('role'); marker.replaceWith(button);
        });
        menu.hidden = true;
        previous.trigger.setAttribute('aria-expanded', 'false');
        if (focus) previous.trigger.focus();
    }

    function open(actions, trigger) {
        if (active?.trigger === trigger) { close(); return; }
        close();
        const moves = [];
        for (const button of actions.querySelectorAll(':scope > button:not(.song-love-btn):not(.song-row-more)')) {
            const marker = document.createComment('手机歌曲操作原位置');
            button.before(marker);
            const label = document.createElement('span');
            label.textContent = button.title || button.getAttribute('aria-label') || button.textContent.trim() || '操作';
            button.append(label); button.setAttribute('role', 'menuitem');
            moves.push({ button, marker, label }); menu.append(button);
        }
        active = { trigger, actions, moves };
        menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
        const rect = trigger.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - menu.offsetHeight - 8)) + 'px';
        menu.querySelector('button')?.focus({ preventScroll: true });
    }

    /** 可重复扫描新增行，已安装的入口不重建，桌面不改变原按钮结构。 */
    function prepare(root = document) {
        if (!mobile.matches) return;
        const rows = root.matches?.('.song-row-actions') ? [root] : root.querySelectorAll('.song-row-actions');
        rows.forEach(actions => {
            if (actions.querySelector('.song-row-more') || actions.querySelector('[data-library-more]')) return;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'song-row-more';
            button.title = '更多操作'; button.setAttribute('aria-label', '更多歌曲操作');
            button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
            button.innerHTML = '<i class="fas fa-ellipsis-h" aria-hidden="true"></i>';
            button.addEventListener('click', event => { event.stopPropagation(); open(actions, button); });
            actions.append(button);
        });
    }
    menu.addEventListener('click', () => close());
    // 原按钮可能阻止冒泡；在业务点击执行后归还节点。
    menu.addEventListener('click', () => queueMicrotask(() => close()), true);
    document.addEventListener('click', event => {
        if (active && !menu.contains(event.target) && !active.trigger.contains(event.target)) close();
    }, true);
    document.addEventListener('keydown', event => {
        if (!active) return;
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
            const index = buttons.indexOf(document.activeElement);
            buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
    });
    document.addEventListener('scroll', event => { if (!menu.contains(event.target)) close(); }, true);
    window.addEventListener('resize', () => close());
    mobile.addEventListener('change', () => { close(); prepare(); });
    new MutationObserver(records => {
        if (active && !active.actions.isConnected) close();
        for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && !menu.contains(node)) prepare(node);
    }).observe(document.body, { childList: true, subtree: true });
    prepare();
    window.MobileSongRowMenu = { prepare, close };
})();
