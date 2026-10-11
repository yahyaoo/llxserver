/** 排行榜独立页面，只装配布局与目录组件。 @author jingyh @date 2026-10-10 */
(function () {
    const template = `<div class="leaderboard-shell">
<aside id="lb-sidebar" class="-translate-x-full custom-scrollbar" aria-label="榜单目录">
    <div class="leaderboard-sidebar-heading"><span>排行榜</span><button type="button" onclick="toggleLbSidebar(false)" aria-label="关闭榜单目录"><i class="fas fa-times"></i></button></div>
    <div id="lb-boards-loading" class="hidden flex items-center justify-center py-8"><i class="fas fa-circle-notch fa-spin text-emerald-500 text-xl"></i></div>
    <nav id="lb-boards-list" class="custom-scrollbar" aria-label="榜单列表" onclick="if(window.innerWidth <= 1024) toggleLbSidebar(false)"></nav>
</aside>
<div id="lb-sidebar-overlay" onclick="toggleLbSidebar(false)" class="bg-black/40 hidden transition-opacity duration-300 opacity-0"></div>
<section class="leaderboard-content" aria-label="榜单歌曲">
                    <!-- 顶部工具栏：增强手机端适配 -->
                    <div class="leaderboard-toolbar">
                        <!-- 手机端显示：切换榜单列表按钮 -->
                        <button onclick="toggleLbSidebar()"
                            class="leaderboard-mobile-toggle p-2 t-text-muted hover:t-bg-main rounded-lg transition-colors"
                            title="切换榜单列表">
                            <i class="fas fa-bars"></i>
                        </button>

                        <!-- 来源选择：手机端减小间距 -->
                        <select id="lb-source-select" onchange="changeLeaderboardSource()"
                            class="lm-select !w-auto min-w-[80px]">
                            <option value="wy">网易云</option>
                            <option value="tx">QQ</option>
                            <option value="kg">酷狗</option>
                            <option value="kw">酷我</option>
                            <option value="mg">咪咕</option>
                        </select>

                        <div class="flex items-center gap-1 md:gap-2 flex-1 min-w-0">
                            <i class="fas fa-chart-bar text-emerald-500 text-xs md:text-sm"></i>
                            <span id="lb-board-title"
                                class="text-xs md:text-sm font-bold t-text-main truncate">请选择榜单</span>
                            <span id="lb-song-count" class="text-[10px] md:text-xs t-text-muted flex-shrink-0"></span>
                        </div>

                        <!-- 播放全部：手机端仅显示图标或紧凑文本 -->
                        <button type="button" aria-label="播放全部" onclick="playAllLeaderboard()"
                            class="flex-shrink-0 flex items-center gap-1 px-2 md:px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] md:text-xs font-bold transition-all shadow-sm hover:shadow-md active:scale-95">
                            <i class="fas fa-play"></i>
                            <span class="hidden sm:inline">播放全部</span>
                        </button>
                    </div>


<!-- 右侧：歌曲列表区 -->
                        <div id="lb-songs-container" class="leaderboard-songs">
                            <!-- 批量操作工具栏 -->
                            <div id="lb-batch-toolbar"
                                class="hidden bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 p-3 flex items-center justify-between flex-shrink-0">
                                <div class="flex items-center gap-3">
                                    <span class="text-sm text-emerald-700 dark:text-emerald-300">已选择:
                                        <span id="lb-batch-selected-count" class="font-bold">0</span> 首</span>
                                    <button onclick="lbSelectAll()"
                                        class="text-xs px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded shadow-sm transition-all font-medium">全选</button>
                                    <button onclick="deselectAll()"
                                        class="text-xs px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded shadow-sm transition-all font-medium">清空</button>
                                    <button onclick="toggleLbBatchMode()"
                                        class="text-xs px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded shadow-sm transition-all font-medium">退出</button>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button onclick="handleBatchCollect()"
                                        class="text-xs px-2 md:px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
                                        title="批量收藏">
                                        <i class="fas fa-folder-plus md:mr-1"></i><span
                                            class="hidden md:inline">批量收藏</span>
                                    </button>
                                    <button onclick="batchDownloadFromList()"
                                        class="text-xs px-2 md:px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                                        title="批量下载">
                                        <i class="fas fa-download md:mr-1"></i><span
                                            class="hidden md:inline">批量下载</span>
                                    </button>
                                </div>
                            </div>

                            <!-- 搜索过滤栏（由 ListSearch 控制） -->
                            <div id="lb-local-search-bar"
                                class="hidden p-3 t-bg-main border-b t-border-main animate-fade-in flex-shrink-0">
                                <div class="flex items-center gap-2 sm:gap-3">
                                    <!-- Search Input -->
                                    <div class="relative flex-1 min-w-[24px]">
                                        <input type="text" id="lb-local-search-input"
                                            class="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border t-border-main rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 t-text-main transition-all"
                                            placeholder="搜索歌曲名、歌手..." oninput="window.ListSearch.handleSearch()"
                                            onkeydown="window.ListSearch.handleKeydown(event)">
                                        <i
                                            class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    </div>

                                    <div id="lb-local-search-nav"
                                        class="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 opacity-0 pointer-events-none transition-opacity">
                                        <div
                                            class="flex border t-border-main rounded-lg overflow-hidden order-1 sm:order-2">
                                            <button onclick="window.ListSearch.navigate(-1)"
                                                class="p-1 sm:p-1.5 hover:t-bg-track t-text-main transition-colors border-r t-border-main"
                                                title="上一个">
                                                <i class="fas fa-chevron-left text-[10px]"></i>
                                            </button>
                                            <button onclick="window.ListSearch.navigate(1)"
                                                class="p-1 sm:p-1.5 hover:t-bg-track t-text-main transition-colors"
                                                title="下一个">
                                                <i class="fas fa-chevron-right text-[10px]"></i>
                                            </button>
                                        </div>
                                        <span id="lb-local-search-count"
                                            class="text-[9px] sm:text-xs font-mono t-text-muted order-2 sm:order-1 leading-none">0/0</span>
                                    </div>

                                    <!-- Filter Toggle -->
                                    <div class="flex items-center gap-3 ml-auto">
                                        <label class="flex items-center cursor-pointer group">
                                            <span
                                                class="text-xs t-text-muted mr-2 group-hover:t-text-main transition-colors hidden sm:block">仅显示匹配项</span>
                                            <div class="relative inline-flex items-center">
                                                <input type="checkbox" id="lb-local-search-filter" class="sr-only peer"
                                                    onchange="window.ListSearch.toggleFilter()">
                                                <div
                                                    class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                                </div>
                                            </div>
                                        </label>
                                        <button onclick="window.ListSearch.toggleBar(false)"
                                            class="p-2 t-text-muted hover:text-red-500 transition-colors" title="关闭搜索">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- 列表表头 -->
                            <div
                                class="flex-shrink-0 grid grid-cols-12 gap-2 md:gap-4 px-5 py-2.5 border-b t-border-main t-bg-panel/80 text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider items-center pr-6">
                                <div class="col-span-1 text-center flex items-center justify-center gap-1">
                                    <div class="flex items-center gap-0.5 md:gap-1 ml-0.5">
                                        <button onclick="toggleLbBatchMode()"
                                            class="text-[10px] md:text-xs text-emerald-600 hover:text-emerald-700"
                                            title="批量操作">
                                            <i class="fas fa-tasks"></i>
                                        </button>
                                        <button onclick="lbToggleListSearch()"
                                            class="text-[10px] md:text-xs text-emerald-600 hover:text-emerald-700 ml-0.5"
                                            title="过滤歌曲">
                                            <i class="fas fa-search"></i>
                                        </button>
                                    </div>
                                </div>
                                <div
                                    class="col-span-7 sm:col-span-5 md:col-span-4 lg:col-span-4 flex items-center min-w-0">
                                    歌曲</div>
                                <div
                                    class="hidden sm:flex sm:col-span-3 md:col-span-3 lg:col-span-2 items-center min-w-0">
                                    歌手</div>
                                <div class="hidden lg:flex lg:col-span-2 items-center min-w-0">专辑</div>
                                <div
                                    class="hidden md:flex md:col-span-2 lg:col-span-1 items-center justify-center text-center min-w-0">
                                    时长</div>
                                <div
                                    class="col-span-4 sm:col-span-3 md:col-span-2 lg:col-span-2 text-right flex items-center justify-end min-w-0">
                                    操作</div>
                            </div>

                            <!-- 歌曲列表 -->
                            <div id="lb-songs-list" class="p-2 space-y-1">
                                <!-- 歌曲行由 JS 注入 -->
                                <div class="flex flex-col items-center justify-center py-20 t-text-muted">
                                    <i class="fas fa-chart-bar text-5xl mb-4 opacity-20"></i>
                                    <p class="text-base font-medium">请从左侧选择一个榜单</p>
                                </div>
                            </div>

                            <!-- 分页 -->
                            <div id="lb-pagination"
                                class="flex-shrink-0 flex items-center justify-center gap-2 md:gap-4 py-3 border-t t-border-main t-bg-panel/80">
                                <button id="lb-btn-first" onclick="window.LeaderboardManager.goToBoundary('first')"
                                    disabled title="首页"
                                    class="px-2 md:px-4 py-1.5 text-xs md:text-sm t-bg-main border t-border-main rounded-lg hover:t-bg-track disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                    <i class="fas fa-angles-left md:mr-1"></i><span class="hidden md:inline">首页</span>
                                </button>
                                <button id="lb-btn-prev" onclick="leaderboardChangePage(-1)" disabled
                                    class="px-2 md:px-4 py-1.5 text-xs md:text-sm t-bg-main border t-border-main rounded-lg hover:t-bg-track disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                    <i class="fas fa-chevron-left md:mr-1"></i><span class="hidden sm:inline">上一页</span>
                                </button>
                                <span id="lb-page-info" class="text-[10px] md:text-sm t-text-muted font-medium">第 1
                                    页</span>
                                <button id="lb-btn-next" onclick="leaderboardChangePage(1)" disabled
                                    class="px-2 md:px-4 py-1.5 text-xs md:text-sm t-bg-main border t-border-main rounded-lg hover:t-bg-track disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                    <span class="hidden sm:inline">下一页</span><i
                                        class="fas fa-chevron-right md:ml-1"></i>
                                </button>
                                <button id="lb-btn-last" onclick="window.LeaderboardManager.goToBoundary('last')"
                                    disabled title="末页"
                                    class="px-2 md:px-4 py-1.5 text-xs md:text-sm t-bg-main border t-border-main rounded-lg hover:t-bg-track disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                    <span class="hidden md:inline">末页</span><i class="fas fa-angles-right md:ml-1"></i>
                                </button>
                            </div>
                        </div>
</section>
</div>`;

    window.LeaderboardView = class LeaderboardView {
        /**
         * 同步挂载页面，确保原业务模块初始化前控件已就绪；重复挂载保留已加载内容。
         * @param {HTMLElement|null} container 排行榜页面挂载容器。
         */
        static mount(container) {
            if (!container || container.dataset.leaderboardMounted === 'true') return;
            container.innerHTML = template;
            this.navigation = new window.LeaderboardNavigationComponent(
                document.getElementById('lb-boards-list'),
                (id, name) => window.LeaderboardManager.selectBoard(id, name)
            );
            container.dataset.leaderboardMounted = 'true';
        }
    };
    window.LeaderboardView.mount(document.getElementById('view-leaderboard'));
})();
