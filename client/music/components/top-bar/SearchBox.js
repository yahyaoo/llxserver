/** 顶部音乐库即时搜索组件。 @author jingyh @date 2026-10-10 */
(() => {
    window.LibrarySearchBox = class {
        static mount(container) {
            container.innerHTML = `<button class="top-mobile-nav md:hidden" onclick="toggleSidebar()" aria-label="打开导航"><i class="fas fa-bars"></i></button>
                <div class="library-search" data-header-dropdown>
                    <div class="library-search-input"><i class="fas fa-search" aria-hidden="true"></i>
                        <input id="library-search-input" type="search" placeholder="搜索音乐库中的歌曲 / 歌手 / 专辑" autocomplete="off" aria-label="搜索音乐库" role="combobox" aria-expanded="false" aria-controls="library-search-results" aria-autocomplete="list">
                    </div>
                    <div id="library-search-results" class="library-search-results hidden" role="listbox" aria-label="音乐库搜索结果"></div>
                </div><span id="page-title" class="sr-only">在线搜索</span>`;
            const input = container.querySelector('input');
            const results = container.querySelector('[role="listbox"]');
            let timer, controller, version = 0, composing = false, selected = -1;
            const close = () => { results.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
            // 小屏上的两个弹层共用可视区域，展开搜索时关闭右侧菜单。
            const show = () => { window.closeHeaderDropdowns?.(); results.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); };
            const online = () => {
                window.switchTab('search');
                document.getElementById('search-input').value = input.value.trim();
                close();
                if (input.value.trim() && typeof doSearch === 'function') doSearch();
            };
            const render = data => {
                results.replaceChildren(); selected = -1;
                for (const [key, title] of [['songs', '歌曲'], ['artists', '歌手'], ['albums', '专辑']]) {
                    const entries = data[key] || [];
                    if (!entries.length) continue;
                    const heading = document.createElement('p'); heading.className = 'library-search-heading'; heading.textContent = title; results.append(heading);
                    entries.forEach(entry => {
                        const button = document.createElement('button'); button.type = 'button'; button.className = 'library-search-item'; button.setAttribute('role', 'option');
                        const img = document.createElement('img'); img.alt = ''; img.className = key === 'artists' ? 'artist-avatar' : '';
                        window.LibraryArtwork.attach(img, key === 'artists' ? entry.avatar : window.MusicExperience.coverUrl(key === 'albums' ? entry.cover : entry));
                        const text = document.createElement('span');
                        const name = document.createElement('strong'); name.textContent = entry.name || '未知歌曲'; text.append(name);
                        const sub = document.createElement('small'); sub.textContent = key === 'artists' ? `${entry.songs.length} 首歌曲` : entry.singer || '未知歌手'; text.append(sub);
                        button.append(img, text);
                        button.onclick = () => { close(); if (key === 'songs') window.MusicExperience.playItem(entry); else window.MusicExperience.openCollection(entry.name, entry.songs); };
                        results.append(button);
                    });
                }
                if (!results.children.length) { const empty = document.createElement('p'); empty.className = 'library-search-heading'; empty.textContent = '音乐库中暂无匹配结果'; results.append(empty); }
                const footer = document.createElement('button'); footer.type = 'button'; footer.className = 'library-search-online'; footer.textContent = `在线搜索「${input.value.trim()}」`; footer.onclick = online; footer.setAttribute('role', 'option'); results.append(footer);
                results.querySelectorAll('[role="option"]').forEach((button, index) => { button.id = `library-option-${index}`; button.setAttribute('aria-selected', 'false'); });
                show();
            };
            const search = () => {
                clearTimeout(timer); controller?.abort(); const requestVersion = ++version;
                if (!input.value.trim()) { close(); return; }
                if (composing) return;
                timer = setTimeout(async () => {
                    controller = new AbortController();
                    try {
                        const response = await fetch('/api/music/library/search?q=' + encodeURIComponent(input.value.trim()), { headers: window.getUserAuthHeaders(), signal: controller.signal });
                        if (!response.ok) throw new Error('音乐库暂时无法检索');
                        const data = await response.json();
                        if (requestVersion === version) render(data);
                    } catch (error) {
                        if (error.name !== 'AbortError' && requestVersion === version) {
                            render({});
                            const hint = results.firstChild;
                            hint.className = '';
                            window.LoadingState.showFailure(hint, { title: '音乐库暂时无法检索', variant: 'inline', retry: search });
                        }
                    }
                }, 180);
            };
            input.addEventListener('input', search);
            input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); controller?.abort(); ++version; });
            input.addEventListener('compositionend', () => { composing = false; search(); });
            input.addEventListener('focus', search);
            input.addEventListener('keydown', event => {
                if (event.isComposing) return;
                if (event.key === 'Escape') { ++version; controller?.abort(); clearTimeout(timer); close(); return; }
                const buttons = [...results.querySelectorAll('[role="option"]')];
                if (event.key === 'Enter') { event.preventDefault(); if (selected >= 0 && !results.classList.contains('hidden')) buttons[selected]?.click(); else online(); }
                if (['ArrowDown', 'ArrowUp'].includes(event.key) && buttons.length) {
                    event.preventDefault(); show(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                    buttons.forEach((button, index) => button.setAttribute('aria-selected', String(index === selected)));
                    input.setAttribute('aria-activedescendant', buttons[selected].id); buttons[selected].scrollIntoView({ block: 'nearest' });
                }
            });
            document.addEventListener('click', event => { if (!container.contains(event.target)) { ++version; clearTimeout(timer); controller?.abort(); close(); } });
            window.addEventListener('music-account-changed', () => { ++version; controller?.abort(); clearTimeout(timer); input.value = ''; results.replaceChildren(); close(); });
        }
    };
})();
