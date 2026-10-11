/** 独立播放页静态模板，沿用歌词及封面控件 ID。 @author jingyh @date 2026-10-10 */
window.LXPlayerDetailTemplate = String.raw`
<!-- Player Detail View (Overlay) -->
    <div id="view-player-detail" ondblclick="toggleDetailCover()"
        class="fixed inset-0 z-30 t-bg-panel hidden flex flex-col transform translate-y-[100%] opacity-0 pb-24">
        <!-- Blurry Background -->
        <div class="player-detail-background">
            <img id="player-artist-background" hidden alt="" aria-hidden="true">
            <img id="detail-bg-cover" src=""
                class="w-full h-full object-cover filter blur-[60px] opacity-40 scale-125 transition-opacity duration-1000">
            <div id="player-detail-bg-overlay" class="absolute inset-0 t-bg-panel/30 backdrop-blur-3xl"></div>
            <!-- Detail Visualizer Canvas (Raised to avoid being blocked by footer) -->
            <canvas id="detail-visualizer"
                class="absolute bottom-24 left-0 w-full h-[calc(100vh-6rem)] pointer-events-none opacity-30"></canvas>
        </div>

        <!-- 播放页关闭与浏览器全屏入口。 -->
        <div class="player-detail-toolbar" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">
            <button onclick="toggleLyrics()" id="btn-toggle-lyrics" title="收起播放页" aria-label="收起播放页"><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
            <button id="player-detail-fullscreen" title="全屏" aria-label="全屏" aria-pressed="false"><i class="fas fa-expand" aria-hidden="true"></i></button>
        </div>

        <!-- Main Content -->
        <div id="player-detail-container"
            class="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-start md:justify-center gap-4 md:gap-20 pt-8 mt-4 md:mt-0 md:pt-0 pb-6 overflow-hidden transition-all duration-300 ease-out [@media(max-height:500px)]:pt-0 [@media(max-height:500px)]:justify-center">

            <!-- Left: Image -->
            <div id="mobile-player-cover-container" ondblclick="toggleDetailCover()"
                class="w-auto h-auto max-w-[48vw] max-h-[32vh] [@media(max-height:500px)]:max-h-[40vh] aspect-square md:w-[60vh] md:h-[60vh] md:max-w-[35rem] md:max-h-[35rem] md:min-w-[20rem] md:min-h-[20rem] flex-shrink-0 shadow-2xl rounded-3xl overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] border-4 border-white/20 origin-top t-bg-track cursor-pointer">
                <img id="detail-cover" src="/music/assets/logo.svg" loading="lazy" fetchpriority="low"
                    onerror="this.src='/music/assets/logo.svg'; this.classList.add('is-placeholder');"
                    class="w-full h-full object-cover dynamic-logo is-placeholder">
            </div>

            <!-- Right: Lyrics -->
            <div id="lyrics-wrapper"
                class="w-full md:w-[500px] lg:w-[600px] flex-1 min-h-0 md:flex-none md:h-full md:max-h-[70vh] flex flex-col relative transition-all duration-300 flex-shrink-0">
                <!-- Song Info -->
                <div class="player-detail-legacy-info mb-4 md:mb-8 text-center md:text-left px-4 md:pl-6 select-none transition-all duration-300 cursor-pointer"
                    onclick="if(window.innerWidth <= 1024) { toggleDetailCover(); event.stopPropagation(); }">
                    <div id="detail-title-container" class="overflow-hidden whitespace-nowrap mb-1">
                        <div id="detail-title"
                            class="inline-block text-2xl md:text-4xl font-black t-text-main drop-shadow-sm max-w-full truncate w-fit mx-auto md:mx-0">
                            Song Name
                        </div>
                    </div>
                    <div id="detail-artist"
                        class="inline-block text-base md:text-xl t-text-muted font-medium truncate max-w-full">Artist
                    </div>
                    <div id="toggle-hint"
                        class="text-[10px] text-emerald-500/60 mt-2 font-mono tracking-widest opacity-80 transition-all duration-1000 overflow-hidden max-h-8">
                        <i class="fas fa-chevron-up text-xs animate-bounce mr-1"></i>
                        <span class="md:hidden">点击歌曲名称隐藏显示封面</span>
                        <span class="hidden md:inline">双击空白区域隐藏显示封面</span>
                    </div>
                </div>

                <!-- Scroll Indicator - 固定参考线 -->
                <div id="lyric-scroll-indicator"
                    class="absolute left-0 right-0 z-20 pointer-events-none flex items-center transition-opacity duration-200"
                    style="display: none;">
                    <!-- 左边：从歌词延伸到右边的虚线 -->
                    <div class="flex-1 h-px border-t-2 border-dashed border-emerald-500 opacity-60"></div>
                    <!-- 右边：时间显示 -->
                    <div
                        class="time-display text-emerald-500 text-base font-mono font-bold tracking-wide ml-3 pr-4 md:pr-8">
                        00:00
                    </div>
                </div>

                <!-- Scrollable Lyrics Area -->
                <div id="lyric-container" onclick="event.stopPropagation()"
                    class="flex-1 w-full overflow-y-auto relative no-scrollbar mask-image-gradient"
                    onwheel="handleLyricScroll()">

                    <div id="lyric-content"
                        class="flex flex-col items-center md:items-start text-center md:text-left gap-3 md:gap-6 py-[40vh] md:pl-6 transition-transform duration-300 ease-out">
                        <!-- Lines injected here -->
                        <p class="t-text-muted text-lg font-medium">暂无歌词</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;
