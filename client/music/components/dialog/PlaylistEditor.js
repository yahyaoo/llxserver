/** 歌单名称、封面编辑及侧栏操作菜单。 @author jingyh */
(() => {
    const placeholder = '/music/assets/logo.svg';
    const safeImage = value => typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|data:image\/(?:jpeg|png|webp);base64,)/i.test(value) ? value : '';
    /** 封面失效时按第一首歌曲封面、应用封面的顺序回退。 */
    function fallback(list) {
        const song = list?.list?.[0];
        const resolved = song && typeof window.getImgUrl === 'function' ? window.getImgUrl(song) : null;
        return safeImage(resolved || song?.meta?.picUrl || song?.picUrl || song?.img || song?.pic || song?.album?.picUrl) || placeholder;
    }
    function attach(image, list) {
        const backup = fallback(list);
        let step = 0;
        image.onerror = () => {
            image.src = step++ === 0 && image.getAttribute('src') !== backup ? backup : placeholder;
            if (image.getAttribute('src') === placeholder) image.onerror = null;
        };
        image.src = safeImage(list?.cover) || backup;
    }
    /** 校验真实图片内容；数据库保存 Data URL，不依赖原机器的文件路径。 */
    async function readCover(file) {
        if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、JPEG、PNG 或 WEBP 图片');
        if (file.size > 5 * 1024 * 1024) throw new Error('封面大小不能超过 5MB');
        const url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
            reader.readAsDataURL(file);
        });
        await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = () => reject(new Error('图片内容无效，请重新选择'));
            image.src = url;
        });
        return url;
    }
    /** 新建和编辑共用表单；取消返回空值，不更改原歌单。 */
    function open(list = {}) {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.id = 'playlist-editor';
            dialog.className = 't-bg-panel t-text-main';
            dialog.innerHTML = `<div><h3>${list.id ? '编辑歌单' : '新建歌单'}</h3><button type="button" data-close aria-label="关闭歌单编辑"><i class="fas fa-times"></i></button></div>
                <form class="playlist-editor-form">
                    <section class="playlist-editor-cover-card">
                        <img id="playlist-editor-preview" alt="歌单封面预览">
                        <div class="playlist-editor-cover-actions">
                            <button type="button" data-upload aria-label="上传或更换封面"><i class="fas fa-pen"></i> 上传封面</button>
                            <button type="button" data-remove aria-label="移除封面"><i class="fas fa-trash"></i></button>
                        </div>
                        <input type="file" id="playlist-editor-file" accept="image/jpeg,image/png,image/webp" hidden>
                        <p>支持 JPG、JPEG、PNG、WEBP，大小 ≤ 5MB</p>
                    </section>
                    <label for="playlist-editor-name">歌单名称</label>
                    <input id="playlist-editor-name" name="name" required maxlength="100" placeholder="请输入歌单名称" autocomplete="off">
                    <p id="playlist-editor-error" role="alert"></p>
                    <div class="playlist-editor-footer"><button type="button" data-cancel>取消</button><button type="submit">确定</button></div>
                </form>`;
            document.body.append(dialog);
            window.DialogChrome?.enhance(dialog);
            const name = dialog.querySelector('#playlist-editor-name');
            const fileInput = dialog.querySelector('#playlist-editor-file');
            const preview = dialog.querySelector('img');
            const submit = dialog.querySelector('[type="submit"]');
            const error = dialog.querySelector('[role="alert"]');
            let cover = list.cover || '', version = 0, finished = false;
            name.value = list.name || '';
            attach(preview, list);
            const close = value => {
                if (finished) return;
                finished = true; version++;
                dialog.close(); dialog.remove(); resolve(value);
            };
            for (const selector of ['[data-close]', '[data-cancel]']) dialog.querySelector(selector).onclick = () => close(null);
            dialog.addEventListener('cancel', event => { event.preventDefault(); close(null); });
            dialog.addEventListener('click', event => { if (event.target === dialog) close(null); });
            dialog.querySelector('[data-upload]').onclick = () => fileInput.click();
            dialog.querySelector('[data-remove]').onclick = () => {
                version++; cover = ''; fileInput.value = ''; error.textContent = ''; submit.disabled = false;
                attach(preview, { ...list, cover: '' });
            };
            fileInput.onchange = async () => {
                if (!fileInput.files[0]) return;
                const request = ++version;
                submit.disabled = true; error.textContent = '';
                try {
                    const value = await readCover(fileInput.files[0]);
                    if (request === version) { cover = value; attach(preview, { cover }); }
                } catch (cause) { if (request === version) error.textContent = cause.message; }
                finally { if (request === version) { submit.disabled = false; fileInput.value = ''; } }
            };
            dialog.querySelector('form').onsubmit = event => {
                event.preventDefault();
                if (submit.disabled) return;
                if (!name.value.trim()) { error.textContent = '歌单名称不能为空'; name.focus(); return; }
                close({ name: name.value.trim(), cover });
            };
            dialog.showModal(); name.focus();
        });
    }
    let menu, trigger;
    function closeMenu() {
        menu?.remove(); menu = null;
        trigger?.setAttribute('aria-expanded', 'false'); trigger = null;
    }
    function toggleMenu(listId, event) {
        event.stopPropagation();
        const button = event.currentTarget;
        const wasOpen = trigger === button;
        closeMenu();
        if (wasOpen) return;
        trigger = button; trigger.setAttribute('aria-expanded', 'true');
        menu = document.createElement('div'); menu.className = 'playlist-row-menu'; menu.setAttribute('role', 'menu');
        menu.innerHTML = '<button type="button" role="menuitem" data-edit><i class="fas fa-pen" aria-hidden="true"></i>编辑</button><button type="button" role="menuitem" data-delete><i class="fas fa-trash" aria-hidden="true"></i>删除</button>';
        const position = button.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(position.right - 120, window.innerWidth - 128))}px`;
        menu.style.top = `${Math.max(8, Math.min(position.bottom + 4, window.innerHeight - 100))}px`;
        menu.querySelector('[data-edit]').onclick = e => { closeMenu(); window.handleRenameList(listId, e); };
        menu.querySelector('[data-delete]').onclick = e => { closeMenu(); window.handleRemoveList(listId, e); };
        document.body.append(menu); menu.querySelector('button').focus();
    }
    document.addEventListener('click', event => { if (!menu?.contains(event.target) && !trigger?.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu) { const button = trigger; closeMenu(); button.focus(); } });
    window.addEventListener('resize', closeMenu);
    document.addEventListener('scroll', closeMenu, true);
    window.PlaylistEditor = { open, attach, fallback, readCover, toggleMenu, closeMenu };
})();
