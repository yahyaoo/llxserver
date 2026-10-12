/** 播放栏静态模板，复用原播放器控件 ID 与业务入口。 @author yahyaoo */
window.LXPlayerBarTemplate = String.raw`
<!-- 圆角底部播放栏，作者：yahyaoo -->
    <footer id="player-footer" class="floating-player" aria-label="音乐播放器">
        <div class="player-transport">
            <button class="player-icon-button" onclick="playPrev()" title="上一首" aria-label="上一首"><i class="fas fa-step-backward"></i></button>
            <button id="btn-play" class="player-icon-button" onclick="togglePlay()" title="播放/暂停" aria-label="播放"><i class="fas fa-play ml-1"></i></button>
            <button class="player-icon-button" onclick="playNext()" title="下一首" aria-label="下一首"><i class="fas fa-step-forward"></i></button>
        </div>
        <div id="player-song-info">
            <div class="player-track">
                <button class="player-cover-button" onclick="toggleLyrics()" title="打开歌词详情" aria-label="打开歌词详情">
                    <img id="player-cover" src="/music/assets/logo.svg" loading="lazy" fetchpriority="low"
                        onerror="this.src='/music/assets/logo.svg'; this.classList.add('is-placeholder');"
                        class="w-full h-full object-cover dynamic-logo is-placeholder" alt="专辑封面">
                </button>
                <div class="player-track-copy">
                    <div class="player-title-row">
                        <div id="player-title" class="font-bold truncate dynamic-marquee min-w-0 w-fit" data-text="暂无播放">暂无播放</div>
                    </div>
                    <div class="player-metadata-row">
                        <div id="player-artist" class="truncate dynamic-marquee min-w-0 w-fit" data-text="选择一首歌曲播放">选择一首歌曲播放</div>
                        <span id="player-album" hidden></span>
                        <div id="player-source"></div>
                    </div>
                </div>
                <div class="player-bar-lyrics" aria-label="同步歌词">
                    <div id="player-lyric-current">暂无歌词</div>
                    <div id="player-lyric-next"></div>
                </div>
            </div>
            <div class="player-progress">
                <span id="time-current" class="player-time">00:00</span>
                <div class="player-progress-track">
                    <div id="progress-container" onclick="seek(event)" title="播放进度">
                        <div id="progress-bar" style="width: 0%"><div class="player-progress-thumb"></div></div>
                    </div>
                </div>
                <span id="time-total" class="player-time">00:00</span>
            </div>
        </div>
        <div class="player-actions">
            <div class="player-popover-anchor" data-player-popover>
                <button id="player-more-btn" class="player-icon-button" onclick="togglePlayerPopover('more')" title="更多操作" aria-label="更多操作" aria-expanded="false" aria-controls="player-more-menu"><i class="fas fa-ellipsis-h"></i></button>
                <div id="player-more-menu" class="player-popover" hidden aria-label="更多播放操作">
                    <button id="btn-player-download" class="player-menu-item" data-player-action onclick="closePlayerPopovers(); handleDownloadClick(event)"><i class="fas fa-download"></i><span>下载/缓存</span></button>
                    <button id="btn-sound-effects" class="player-menu-item" data-player-action onclick="closePlayerPopovers(); window.soundEffects && window.soundEffects.toggle()"><i class="fas fa-sliders-h"></i><span>均衡器 & 音效</span></button>
                    <button class="player-menu-item" data-player-action onclick="closePlayerPopovers(); window.lyricCard && window.lyricCard.open()"><i class="fas fa-image"></i><span>分享歌词卡片</span></button>
                    <button id="btn-lyric-settings" class="player-menu-item" onclick="window.lyricSettings.open()"><i class="fas fa-language" aria-hidden="true"></i><span>歌词显示设置</span></button>
                    <button class="player-menu-item" data-player-action onclick="closePlayerPopovers(); toggleCommentModal()"><i class="far fa-comment-dots"></i><span>歌曲评论</span></button>
                    <div class="player-speed-control relative group">
                        <div class="player-menu-item"><i class="fas fa-tachometer-alt"></i><span>播放速度</span><button id="playback-rate-btn" onclick="togglePlaybackRateMenu(event)" title="播放速度">1.0x</button></div>
                    <div id="playback-rate-menu"
                        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 t-bg-panel rounded-lg shadow-xl border t-border-main py-2 w-20 md:w-24 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div
                            class="text-[10px] font-bold t-text-muted px-3 py-1 uppercase tracking-wider text-center border-b border-gray-50 mb-1">
                            倍速</div>
                        <button onclick="setPlaybackRate(0.5)"
                            class="playback-rate-option w-full px-3 py-1.5 text-center hover:t-bg-item-hover text-xs md:text-sm transition-colors"
                            data-rate="0.5">0.5x</button>
                        <button onclick="setPlaybackRate(0.75)"
                            class="playback-rate-option w-full px-3 py-1.5 text-center hover:t-bg-item-hover text-xs md:text-sm transition-colors"
                            data-rate="0.75">0.75x</button>
                        <button onclick="setPlaybackRate(1.0)"
                            class="playback-rate-option w-full px-3 py-1.5 text-center hover:t-bg-item-hover text-xs md:text-sm transition-colors"
                            data-rate="1.0">1.0x</button>
                        <button onclick="setPlaybackRate(1.25)"
                            class="playback-rate-option w-full px-3 py-1.5 text-center hover:t-bg-item-hover text-xs md:text-sm transition-colors"
                            data-rate="1.25">1.25x</button>
                        <button onclick="setPlaybackRate(1.5)"
                            class="playback-rate-option w-full px-3 py-1.5 text-center hover:t-bg-item-hover text-xs md:text-sm transition-colors"
                            data-rate="1.5">1.5x</button>
                        <button onclick="setPlaybackRate(2.0)"
                            class="playback-rate-option w-full px-3 py-1.5 text-center hover:t-bg-item-hover text-xs md:text-sm transition-colors"
                            data-rate="2.0">2.0x</button>
                    </div>

                    </div>
                </div>
            </div>
                <!-- 播放模式 -->
                <div class="relative group">
                    <button id="play-mode-btn" onclick="closePlayerPopovers(); togglePlayModeMenu(event)"
                        class="player-icon-button" title="播放模式">
                        <i class="fas fa-redo"></i>
                    </button>
                    <!-- 播放模式菜单 -->
                    <div id="play-mode-menu"
                        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 t-bg-panel rounded-lg shadow-xl border t-border-main py-2 w-40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div class="text-xs font-bold t-text-muted px-3 py-1 uppercase tracking-wider">播放模式</div>
                        <button onclick="setPlayMode('list')"
                            class="play-mode-option w-full px-3 py-2 text-left hover:t-bg-item-hover flex items-center gap-2 text-sm transition-colors"
                            data-mode="list">
                            <i class="fas fa-redo w-4 text-emerald-500"></i>
                            <span>列表循环</span>
                        </button>
                        <button onclick="setPlayMode('single')"
                            class="play-mode-option w-full px-3 py-2 text-left hover:t-bg-item-hover flex items-center gap-2 text-sm transition-colors"
                            data-mode="single">
                            <i class="fas fa-redo-alt w-4 text-blue-500"></i>
                            <span>单曲循环</span>
                        </button>
                        <button onclick="setPlayMode('random')"
                            class="play-mode-option w-full px-3 py-2 text-left hover:t-bg-item-hover flex items-center gap-2 text-sm transition-colors"
                            data-mode="random">
                            <i class="fas fa-random w-4 text-purple-500"></i>
                            <span>随机播放</span>
                        </button>
                        <button onclick="setPlayMode('roaming')" class="play-mode-option" data-mode="roaming"><i class="fas fa-heart roaming-heart"></i><span>漫游播放</span></button>
                        <button onclick="setPlayMode('order')"
                            class="play-mode-option w-full px-3 py-2 text-left hover:t-bg-item-hover flex items-center gap-2 text-sm transition-colors"
                            data-mode="order">
                            <i class="fas fa-play w-4 text-gray-500"></i>
                            <span>顺序播放</span>
                        </button>
                    </div>
                </div>


            <button id="player-like-btn" class="player-icon-button text-gray-300 hover:text-red-500 transition-colors" title="加入我的喜爱" aria-label="加入我的喜爱" aria-pressed="false"><i class="far fa-heart"></i></button>
            <button class="player-icon-button" onclick="toggleQueueDrawer()" title="播放队列" aria-label="播放队列"><i class="fas fa-list-ul"></i></button>
            <div class="player-popover-anchor player-volume-anchor" data-player-popover>
                <button id="player-volume-btn" class="player-icon-button" onclick="togglePlayerPopover('volume')" title="音量" aria-label="音量" aria-expanded="false" aria-controls="player-volume-popover"><i id="volume-icon" class="fas fa-volume-up w-4"></i></button>
                <div id="player-volume-popover" class="player-popover player-volume-popover" hidden aria-label="音量控制">
                    <div class="player-volume-row">
                        <button class="player-icon-button" onclick="toggleMute()" title="切换静音" aria-label="切换静音"><i class="fas fa-volume-mute"></i></button>
                        <div id="volume-container" class="player-volume-track" onclick="setVolume(event)" tabindex="0" role="slider" aria-label="音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75">
                            <div class="player-volume-rail"><div id="volume-bar" style="width: 75%"></div></div>
                        </div>
                        <span id="volume-percent">75%</span>
                    </div>
                </div>
            </div>
        </div>
    </footer>
`;
