/** 主导航组件，在业务脚本执行前同步挂载，重复挂载保留收藏树状态。 */
(() => {
    const template = `
            <div class="main-navigation-brand h-16 flex items-center justify-center border-b t-border-main relative">
                <svg viewBox="0 0 447.942 447.943" class="w-8 h-8 mr-2 rounded-lg shadow-sm"
                    xmlns="http://www.w3.org/2000/svg">
                    <path style="fill: var(--c-400)"
                        d="M203.806.482c-19.668-3.346-35.76 11.139-35.76 31.086v206.166c-11.642-4.271-24.165-6.725-37.281-6.725-59.905 0-108.469 48.566-108.469 108.473 0 59.903 48.564 108.461 108.469 108.461 34.141 0 64.54-15.82 84.406-40.482l-49.658-49.664c-15.116-15.112-11.708-28.901-9.542-34.14 2.166-5.233 9.514-17.4 30.883-17.4h18.082v-56.885c0-21.132 14.617-38.862 34.266-43.745.032-44.373.032-81.808.032-81.808 140.147 0 131.724 83.974 115.325 132.196-6.42 18.884-2.601 22.05 10.893 7.354C536.473 77.106 298.38 16.566 203.806.482z" />
                    <path style="fill: var(--c-600)"
                        d="M301.061 223.876h-50.994c-3.911 0-7.574.95-10.889 2.523-8.616 4.09-14.615 12.798-14.615 22.973v76.51h-37.708c-14.082 0-17.428 8.071-7.466 18.029l46.893 46.898 31.25 31.246a25.424 25.424 0 0 0 18.033 7.474c6.523 0 13.052-2.484 18.029-7.474l78.152-78.145c9.951-9.958 6.608-18.029-7.47-18.029h-37.71v-76.51c.001-14.078-11.42-25.495-25.505-25.495z" />
                </svg>
                <h1 class="text-xl font-bold text-emerald-600 tracking-wider">LX MUSIC</h1>
                <!-- Close button for mobile -->
                <button onclick="toggleSidebar()" class="md:hidden absolute right-4 text-gray-500 hover:text-red-500">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <nav id="main-navigation" class="main-navigation-scroll flex-1 py-4 overflow-y-auto custom-scrollbar" aria-label="主导航">
                <ul>
                    <li>
                        <a href="#" onclick="switchTab('search')" id="tab-search" title="搜索" aria-label="搜索"
                            class="active-tab flex items-center px-6 py-3 hover:t-bg-main transition-colors duration-200">
                            <i class="fas fa-search w-6 text-center"></i>
                            <span class="ml-3 font-medium">搜索</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" onclick="switchTab('songlist')" id="tab-songlist" title="歌单" aria-label="歌单"
                            class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main transition-colors duration-200">
                            <i class="fas fa-list-ul w-6 text-center"></i>
                            <span class="ml-3 font-medium">歌单</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" onclick="switchTab('leaderboard')" id="tab-leaderboard" title="排行榜" aria-label="排行榜"
                            class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main transition-colors duration-200">
                            <i class="fas fa-chart-bar w-6 text-center"></i>
                            <span class="ml-3 font-medium">排行榜</span>
                        </a>
                    </li>
                    <li>
                        <!--
                            这是「我的收藏 / 歌单」折叠面板的父级容器标题，统一叫「我的收藏」。
                            面板内部嵌套的 ♥ 喜爱列表另命名为「我的喜爱」(见 app.js 中 id='love' 的项)，
                            以此与外层容器区分，避免重名混淆。
                        -->
                        <div onclick="handleFavoritesClick()" id="tab-favorites" title="我的收藏" aria-label="我的收藏"
                            class="flex items-center justify-between px-6 py-3 t-text-muted hover:t-bg-main transition-colors duration-200 cursor-pointer select-none">
                            <div class="flex items-center">
                                <i class="fas fa-folder w-6 text-center"></i>
                                <span class="ml-3 font-medium">我的收藏</span>
                            </div>
                            <i id="favorites-arrow"
                                class="fas fa-chevron-down text-xs transition-transform duration-200"></i>
                        </div>
                        <ul id="favorites-children" class="t-bg-main/50 overflow-hidden transition-all duration-300">
                            <li class="px-1.5 py-1">
                                <div id="my-lists-container" class="space-y-1 pb-1">
                                    <!-- Lists will be injected here -->
                                    <div class="px-3 py-2 text-sm t-text-muted">请先在设置中登录</div>
                                </div>
                            </li>
                            <li class="px-3 pb-3">
                                <button onclick="handleCreateList()"
                                    class="w-full py-1.5 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-500 hover:text-emerald-500 hover:border-emerald-400 transition-colors flex items-center justify-center gap-1">
                                    <i class="fas fa-plus"></i> 新建歌单
                                </button>
                            </li>
                            <li class="my-1">
                                <div class="mx-3 border-t t-border-main opacity-50"></div>
                            </li>
                            <li>
                                <div onclick="handleDislikeFolderClick()" id="tab-dislike"
                                    class="flex items-center justify-between px-4 py-2 text-sm t-text-muted hover:t-bg-main transition-colors duration-200 cursor-pointer select-none rounded-lg mx-1.5 group">
                                    <div class="flex items-center">
                                        <i
                                            class="fas fa-ban w-5 text-center group-hover:text-emerald-500 transition-colors"></i>
                                        <span class="ml-2">不喜欢</span>
                                    </div>
                                    <i id="dislike-arrow"
                                        class="fas fa-chevron-right text-[10px] transition-transform duration-200 mr-2"></i>
                                </div>
                                <ul id="dislike-children"
                                    class="t-bg-main/50 overflow-hidden transition-all duration-300 hidden rounded mt-1"
                                    style="height: 0;">
                                    <li>
                                        <div id="dislike-lists-container" class="space-y-1 pb-1 pt-1 px-1.5">
                                            <!-- 不喜欢歌曲 -->
                                            <div class="playlist-sidebar-item text-[13px] t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none"
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
                                                    class="text-[11px] text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0">0</span>
                                            </div>
                                            <!-- 不喜欢歌手 -->
                                            <div class="playlist-sidebar-item text-[13px] t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none"
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
                                                    class="text-[11px] text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0">0</span>
                                            </div>
                                            <!-- 不喜欢专辑 -->
                                            <div class="playlist-sidebar-item text-[13px] t-text-muted hover:t-bg-main cursor-pointer flex items-center group select-none"
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
                                                    class="text-[11px] text-gray-400 group-hover:t-text-muted mr-1 flex-shrink-0">0</span>
                                            </div>
                                        </div>
                                    </li>
                                </ul>
                            </li>
                            <li class="my-1">
                                <div class="mx-3 border-t t-border-main opacity-50"></div>
                            </li>
                        </ul>
                    </li>
                    <li>
                        <a href="#" onclick="switchTab('localmusic')" id="tab-localmusic" title="本地音乐" aria-label="本地音乐"
                            class="flex items-center justify-between px-6 py-3 t-text-muted hover:t-bg-main transition-colors duration-200">
                            <div class="flex items-center">
                                <i class="fas fa-compact-disc w-6 text-center"></i>
                                <span class="ml-3 font-medium">本地音乐</span>
                            </div>
                            <!-- 自定义歌曲目录开关入口（仅登录且后端启用时展现） -->
                            <div id="custom-dir-switch-container" class="hidden items-center ml-2" title="自定义歌曲目录开关"
                                onclick="event.stopPropagation()">
                                <label class="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                                    <input type="checkbox" id="user-custom-dir-switch" class="sr-only peer">
                                    <div
                                        class="w-9 h-5 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500">
                                    </div>
                                </label>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="#" onclick="switchTab('settings')" id="tab-settings" title="设置" aria-label="设置"
                            class="flex items-center px-6 py-3 t-text-muted hover:t-bg-main transition-colors duration-200">
                            <i class="fas fa-cog w-6 text-center"></i>
                            <span class="ml-3 font-medium">设置</span>
                        </a>
                    </li>
                </ul>
            </nav>

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
