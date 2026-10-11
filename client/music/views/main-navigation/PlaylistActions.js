/** 歌单新建与导入菜单，复用账号请求、提示及列表渲染能力。 @author jingyh */
(() => {
    let importing = false;
    const trigger = () => document.getElementById('playlist-actions-button');
    const menu = () => document.getElementById('playlist-actions-menu');

    /** 关闭浮层，键盘关闭时将焦点返回触发按钮。 */
    function closeMenu(restoreFocus = false) {
        if (menu()) menu().hidden = true;
        trigger()?.setAttribute?.('aria-expanded', 'false');
        if (restoreFocus) trigger()?.focus();
    }

    /** 按需创建页面浮层，避免被侧栏的滚动和裁剪规则遮挡。 */
    function ensureMenu() {
        if (menu()) return menu();
        const element = document.createElement('div');
        element.id = 'playlist-actions-menu';
        element.className = 'playlist-actions-menu';
        element.setAttribute('role', 'menu');
        element.setAttribute('aria-label', '歌单操作');
        element.hidden = true;
        element.innerHTML = '<button type="button" role="menuitem" data-playlist-action="create"><i class="fas fa-plus" aria-hidden="true"></i>新建</button><button type="button" role="menuitem" data-playlist-action="import"><i class="fas fa-file-import" aria-hidden="true"></i>导入</button>';
        element.addEventListener('click', event => {
            const action = event.target.closest('[data-playlist-action]')?.dataset.playlistAction;
            if (!action) return;
            closeMenu(true);
            if (action === 'create') window.handleCreateList();
            else {
                let input = document.getElementById('playlist-import-file');
                if (!input) {
                    input = document.createElement('input');
                    input.id = 'playlist-import-file'; input.type = 'file';
                    input.accept = '.json,application/json'; input.hidden = true;
                    input.addEventListener('change', () => window.importPlaylistFile(input));
                    document.body.appendChild(input);
                }
                input.value = ''; input.click();
            }
        });
        document.body.appendChild(element);
        return element;
    }

    /** 展开新建与导入选项，并将浮层限制在当前可视区域内。 */
    window.togglePlaylistActions = event => {
        event?.stopPropagation();
        if (importing) return;
        const element = ensureMenu();
        if (!element.hidden) { closeMenu(true); return; }
        element.hidden = false;
        trigger().setAttribute('aria-expanded', 'true');
        const rect = trigger().getBoundingClientRect();
        const width = element.offsetWidth, height = element.offsetHeight;
        element.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + 'px';
        element.style.top = Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6) + 'px';
        element.querySelector('button').focus();
    };

    /**
     * 上传歌单备份，仅在服务器确认写库后应用列表与浏览器缓存。
     * @param input 单文件选择控件。
     * @returns 导入结束的 Promise，失败时保留原列表并提示错误。
     * @author jingyh
     */
    window.importPlaylistFile = async input => {
        const file = input.files?.[0];
        if (!file || importing) { input.value = ''; return; }
        importing = true;
        const button = trigger();
        if (button) button.disabled = true;
        try {
            if (file.size > 20 * 1024 * 1024) throw new Error('歌单文件不能超过 20 MB');
            const target = window.getPlaylistImportTarget();
            if (!target) throw new Error('歌单尚未加载，请稍后重试');
            if (window.preparePlaylistImport && !await window.preparePlaylistImport(target)) return;
            const form = new FormData(); form.append('file', file);
            const response = await window.fetchDownloadWithAuth('/api/music/playlists/import?' + new URLSearchParams({ user: target }), { method: 'POST', body: form });
            const text = await response.text();
            let result;
            try { result = JSON.parse(text); } catch { throw new Error(text || '歌单导入失败'); }
            if (!response.ok || !result.success) throw new Error(result.message || '歌单导入失败');
            await window.applyImportedPlaylists(result);
            window.showSuccess(`已导入 ${result.playlists} 个歌单，共 ${result.songs} 首歌曲`);
        } catch (error) {
            window.showError(error.message || '歌单导入失败，请重试');
        } finally {
            importing = false; input.value = '';
            if (button) button.disabled = false;
        }
    };

    document.addEventListener('click', event => {
        if (!menu()?.contains(event.target) && !trigger()?.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
        const element = menu();
        if (!element || element.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
        else if (event.key === 'Tab') closeMenu();
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const items = [...element.querySelectorAll('button')];
            const index = items.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next].focus();
        }
    });
    document.addEventListener('scroll', () => closeMenu(), true);
    window.addEventListener('resize', () => closeMenu());
})();
