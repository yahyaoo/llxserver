/** 主导航组件，在业务脚本执行前同步挂载，重复挂载保留收藏树状态。 */
(() => {
    /** 收藏固定入口先显示零计数，账号数据返回后由列表渲染接管。 */
    const initialFavorites = [
        ['love', '收藏歌曲', 'fa-music', "handleListClick('love')", ''],
        ['__lib_artists__', '收藏歌手', 'fa-user', 'handleArtistLibraryClick()', 'lib-artist-count'],
        ['__lib_albums__', '收藏专辑', 'fa-compact-disc', 'handleAlbumLibraryClick()', 'lib-album-count'],
    ].map(([id, name, icon, action, countId]) => `<div class="playlist-sidebar-item text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none" data-sidebar-list-id="${id}" onclick="${action}; event.stopPropagation();"><i class="fas ${icon} w-5 t-text-muted sidebar-item-icon flex-shrink-0 text-center"></i><div class="playlist-name-wrapper ml-1.5 flex-1 min-w-0 overflow-hidden" title="${name}"><span class="playlist-name-text truncate block w-full select-none">${name}</span></div><span ${countId ? `id="${countId}"` : ''} class="text-xs text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0 sidebar-item-count">0</span></div>`).join('');
    const template = `
            <div class="main-navigation-brand h-16 flex items-center justify-center border-b t-border-main relative">
                <img src="/music/assets/logo.svg" class="w-8 h-8 mr-2 rounded-lg shadow-sm dynamic-logo" alt="洛洛雪音乐">
                <h1 class="text-xl font-bold text-emerald-600 tracking-wider">洛洛雪音乐</h1>
                <!-- Close button for mobile -->
                <button onclick="toggleSidebar()" class="md:hidden absolute right-4 text-gray-500 hover:text-red-500">
                    <i class="fas fa-times"></i>
                </button>
            </div>

<nav id="main-navigation" class="main-navigation-scroll flex-1 py-4 overflow-y-auto custom-scrollbar" aria-label="主导航"><ul>
        <li class="nav-group-start" data-group="发现"><a href="#" onclick="switchTab('search'); return false" id="tab-search" title="在线搜索" aria-label="在线搜索" class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main"><i class="fas fa-search w-6 text-center"></i><span class="ml-3 font-medium">在线搜索</span></a></li>
        <li><a href="#" onclick="switchTab('songlist'); return false" id="tab-songlist" title="在线歌单" aria-label="在线歌单" class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main"><i class="fas fa-list-ul w-6 text-center"></i><span class="ml-3 font-medium">在线歌单</span></a></li>
        <li><a href="#" onclick="switchTab('leaderboard'); return false" id="tab-leaderboard" title="排行榜" aria-label="排行榜" class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main"><i class="fas fa-chart-bar w-6 text-center"></i><span class="ml-3 font-medium">排行榜</span></a></li>
        <li class="nav-group-start" data-group="我的音乐"><a href="#" onclick="switchTab('recent'); return false" id="tab-recent" title="最近" aria-label="最近" class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main"><i class="far fa-clock w-6 text-center"></i><span class="ml-3 font-medium">最近</span></a></li>
        <li><a href="#" onclick="switchTab('localmusic'); return false" id="tab-localmusic" title="音乐库" aria-label="音乐库" class="flex items-center justify-between px-6 py-3 t-text-muted"><div class="flex items-center"><i class="fas fa-compact-disc w-6 text-center"></i><span class="ml-3 font-medium">音乐库</span></div>
</a></li>
        <li><a href="#" onclick="switchTab('downloads'); return false" id="tab-downloads" title="下载管理" aria-label="下载管理" class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main"><i class="fas fa-cloud-download-alt w-6 text-center"></i><span class="ml-3 font-medium">下载管理</span></a></li>
        <li class="nav-group-divider nav-group-folder"><div onclick="handleFavoritesClick()" id="tab-favorites" title="收藏" aria-label="收藏" class="flex items-center justify-between px-6 py-3 t-text-muted cursor-pointer"><div class="flex items-center"><i class="far fa-heart w-6 text-center"></i><span class="ml-3 font-medium">收藏</span></div><i id="favorites-arrow" class="fas fa-chevron-down text-xs"></i></div>
            <ul id="favorites-children" class="overflow-hidden transition-all duration-300"><li><div id="my-lists-container" class="space-y-1 px-1.5">${initialFavorites}</div></li></ul></li>
        <li class="nav-group-divider nav-group-folder"><div onclick="handleDislikeFolderClick()" id="tab-dislike"
                                    title="不喜欢" aria-label="不喜欢" class="flex items-center justify-between px-6 py-3 t-text-muted cursor-pointer select-none">
                                    <div class="flex items-center">
                                        <i class="fas fa-ban w-6 text-center"></i>
                                        <span class="ml-3 font-medium">不喜欢</span>
                                    </div>
                                    <i id="dislike-arrow"
                                        class="fas fa-chevron-right text-xs transition-transform duration-200"></i>
                                </div>
                                <ul id="dislike-children"
                                    class="overflow-hidden transition-all duration-300 hidden"
                                    style="height: 0;">
                                    <li>
                                        <div id="dislike-lists-container" class="space-y-1 pb-1 pt-1 px-1.5">
                                            <!-- 不喜欢歌曲 -->
                                            <div class="playlist-sidebar-item text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none"
                                                data-sidebar-list-id="dislike_songs"
                                                onclick="handleDislikeSongsClick(); event.stopPropagation();">
                                                <i
                                                    class="fas fa-music w-5 t-text-muted sidebar-item-icon flex-shrink-0 text-center"></i>
                                                <div class="playlist-name-wrapper ml-1.5 flex-1 min-w-0 overflow-hidden"
                                                    title="不喜欢歌曲">
                                                    <span
                                                        class="playlist-name-text truncate block w-full select-none">不喜欢歌曲</span>
                                                </div>
                                                <span id="dislike-song-count"
                                                    class="text-xs text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0 sidebar-item-count">0</span>
                                            </div>
                                            <!-- 不喜欢歌手 -->
                                            <div class="playlist-sidebar-item text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none"
                                                data-sidebar-list-id="dislike_artists"
                                                onclick="handleDislikeArtistsClick(); event.stopPropagation();">
                                                <i
                                                    class="fas fa-user w-5 t-text-muted sidebar-item-icon flex-shrink-0 text-center"></i>
                                                <div class="playlist-name-wrapper ml-1.5 flex-1 min-w-0 overflow-hidden"
                                                    title="不喜欢歌手">
                                                    <span
                                                        class="playlist-name-text truncate block w-full select-none">不喜欢歌手</span>
                                                </div>
                                                <span id="dislike-artist-count"
                                                    class="text-xs text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0 sidebar-item-count">0</span>
                                            </div>
                                            <!-- 不喜欢专辑 -->
                                            <div class="playlist-sidebar-item text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none"
                                                data-sidebar-list-id="dislike_albums"
                                                onclick="handleDislikeAlbumsClick(); event.stopPropagation();">
                                                <i
                                                    class="fas fa-compact-disc w-5 t-text-muted sidebar-item-icon flex-shrink-0 text-center"></i>
                                                <div class="playlist-name-wrapper ml-1.5 flex-1 min-w-0 overflow-hidden"
                                                    title="不喜欢专辑">
                                                    <span
                                                        class="playlist-name-text truncate block w-full select-none">不喜欢专辑</span>
                                                </div>
                                                <span id="dislike-album-count"
                                                    class="text-xs text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0 sidebar-item-count">0</span>
                                            </div>
                                        </div>
                                    </li>
                                </ul></li>
        <li class="nav-group-divider"><div class="playlist-group-heading"><button type="button" class="playlist-group-link" onclick="PlaylistsView.open()" title="查看所有歌单"><i class="fas fa-layer-group" aria-hidden="true"></i><span>歌单</span><i class="fas fa-chevron-right playlist-group-arrow" aria-hidden="true"></i></button><button type="button" id="playlist-actions-button" onclick="togglePlaylistActions(event)" title="新建或导入歌单" aria-label="新建或导入歌单" aria-haspopup="menu" aria-expanded="false" aria-controls="playlist-actions-menu"><i class="fas fa-plus" aria-hidden="true"></i></button></div><div id="playlist-lists-container" class="space-y-1 px-1.5"><div class="px-3 py-2 t-text-muted">${window.LoadingState.render('正在加载歌单…', 'inline')}</div></div></li>
        </ul></nav>

            <!-- Mini Player Info (Optional, cover art here) -->
            <div class="hidden md:block [@media(max-height:535px)]:!hidden sidebar-song-info-wrapper mt-auto">
                <div id="sidebar-song-info" class="p-4 border-t t-border-main hidden">
                    <img id="sidebar-cover" src="/music/assets/logo.svg" loading="lazy" fetchpriority="low"
                        onerror="this.src='/music/assets/logo.svg'; this.classList.add('is-placeholder');" alt="Cover"
                        class="w-full rounded-lg shadow-md mb-3 dynamic-logo is-placeholder">
                    <div class="text-center flex flex-col items-center">
                        <div id="sidebar-song-name" class="font-bold text-sm truncate max-w-full block">Song Name
                        </div>
                        <div id="sidebar-singer" class="text-xs text-gray-500 truncate max-w-full block">Artist
                        </div>
                    </div>
                </div>
            </div>

            <button type="button" id="main-navigation-collapse" class="main-navigation-collapse" onclick="toggleMainNavigation()"
                aria-expanded="true" aria-controls="main-navigation" aria-label="收起主导航" title="收起主导航">
                <i class="fas fa-angle-double-left" aria-hidden="true"></i><span>收起</span>
            </button>
        `;

    window.MainNavigation = class MainNavigation {
        /** @param {HTMLElement|null} container 主导航挂载容器。 */
        static mount(container) {
            if (!container || container.dataset.navigationMounted === 'true') return;
            container.innerHTML = template;
            container.dataset.navigationMounted = 'true';
        }
    };
    window.MainNavigation.mount(document.getElementById('main-sidebar'));
})();
