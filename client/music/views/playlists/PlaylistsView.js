/** 独立歌单总览页，使用已有歌单数据与详情入口。 @author yahyaoo @date 2026-10-12 */
(() => {
    const section = document.createElement('section'); section.id = 'view-playlists'; section.className = 'playlist-overview hidden opacity-0';
    document.getElementById('view-localmusic').parentElement.append(section);
    window.PlaylistsView = {
        async open() {
            const data = await window.ensurePlaylistDataAvailable();
            if (!data) return;
            window.switchTab('playlists'); this.render(data.userList || []);
        },
        render(lists) {
            section.replaceChildren();
            const heading = document.createElement('header'); heading.className = 'playlist-overview-heading';
            const title = document.createElement('div'), h2 = document.createElement('h2'), meta = document.createElement('p');
            h2.textContent = '歌单'; meta.textContent = `共 ${lists.length} 个歌单`; title.append(h2, meta);
            const add = document.createElement('button'); add.type = 'button'; add.innerHTML = '<i class="fas fa-plus"></i> 新建歌单'; add.onclick = () => window.handleCreateList();
            heading.append(title, add); section.append(heading);
            const grid = document.createElement('div'); grid.className = 'collection-card-grid'; section.append(grid);
            lists.forEach(list => {
                const card = document.createElement('button'); card.type = 'button'; card.className = 'collection-card'; card.setAttribute('aria-label', '打开歌单 ' + list.name);
                const cover = document.createElement('span'); cover.className = 'collection-card-cover';
                const image = document.createElement('img'); image.alt = list.name + '封面';
                window.PlaylistEditor.attach(image, list);
                const count = document.createElement('span'); count.className = 'collection-card-count'; count.textContent = String(list.list?.length || 0); cover.append(image, count);
                const name = document.createElement('strong'); name.textContent = list.name;
                const detail = document.createElement('small'); detail.textContent = `${list.list?.length || 0} 首歌曲`;
                card.append(cover, name, detail); card.onclick = () => window.handleListClick(list.id); grid.append(card);
            });
            if (!lists.length) { const empty = document.createElement('p'); empty.className = 'collection-empty'; empty.textContent = '还没有歌单，点击新建歌单开始收藏'; grid.append(empty); }
        },
    };
})();
