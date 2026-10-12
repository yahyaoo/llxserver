/** 独立播放页，编排原控件并保留播放、队列和歌词业务入口。 @author jingyh @date 2026-10-10 */
(function () {
    class PlayerDetailView {
        constructor(view) {
            this.view = view;
            this.moves = [];
            this.open = false;
            this.ownsFullscreen = false;
            this.onViewChange = () => this.sync();
            this.onTrackChange = () => { if (this.open) this.updateTrack(); };
            this.onFullscreenChange = () => this.updateFullscreen();
            this.onAccountChange = () => { if (this.open) this.updateTrack(true); };
        }

        /** 同步挂载页面，确保业务初始化前已有全部歌词与画布节点。 */
        mount() {
            const container = document.getElementById('player-detail-container');
            this.left = document.createElement('section');
            this.left.className = 'player-detail-left';
            this.left.setAttribute('aria-label', '当前歌曲与播放控制');
            this.left.addEventListener('dblclick', event => event.stopPropagation());
            container.prepend(this.left);
            this.coverStage = document.createElement('div');
            this.coverStage.className = 'player-cover-stage';
            this.left.append(this.coverStage);
            this.coverStage.append(document.getElementById('mobile-player-cover-container'));
            this.miniLyrics = document.querySelector('.player-bar-lyrics');
            this.visualizer = document.getElementById('detail-visualizer');
            this.lyricMarker = document.createComment('同步歌词原位置');
            this.visualizerMarker = document.createComment('频谱画布原位置');
            this.miniLyrics.before(this.lyricMarker);
            this.visualizer.before(this.visualizerMarker);
            this.lyricsButton = document.createElement('button');
            this.lyricsButton.id = 'player-mobile-lyrics';
            this.lyricsButton.className = 'player-icon-button player-mobile-only';
            this.lyricsButton.title = '全屏歌词';
            this.lyricsButton.setAttribute('aria-label', '全屏歌词');
            this.lyricsButton.innerHTML = '<i class="fas fa-align-left" aria-hidden="true"></i>';
            this.lyricsButton.addEventListener('click', () => window.PlayerFeaturePages.openLyrics());
            window.addEventListener('resize', () => this.updateResponsiveLayout());
            this.fullscreenButton = document.getElementById('player-detail-fullscreen');
            this.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());
            this.background = new window.PlayerBackground(document.getElementById('player-artist-background'));
            this.album = document.getElementById('player-album');
            this.spectrumButton = document.createElement('button');
            this.spectrumButton.className = 'player-menu-item player-detail-spectrum';
            this.spectrumButton.setAttribute('role', 'switch');
            this.spectrumButton.innerHTML = '<i class="fas fa-wave-square"></i><span>详情页视觉特效</span><span class="player-detail-switch" aria-hidden="true"></span>';
            this.spectrumButton.addEventListener('click', () => {
                window.updateSetting('showDetailVisualizer', !window.settings.showDetailVisualizer);
                this.updateSpectrum();
            });
            this.spectrumButton.addEventListener('dblclick', event => event.stopPropagation());
            this.viewObserver = new MutationObserver(this.onViewChange);
            this.viewObserver.observe(this.view, { attributes: true, attributeFilter: ['class'] });
            this.trackObserver = new MutationObserver(this.onTrackChange);
            for (const id of ['player-title', 'player-artist', 'detail-title']) {
                this.trackObserver.observe(document.getElementById(id), { childList: true, characterData: true, subtree: true });
            }
            // 频谱快捷键和设置页都可能修改已有开关，菜单打开时读最新状态。
            document.getElementById('player-more-btn').addEventListener('click', () => this.updateSpectrum());
            document.addEventListener('fullscreenchange', this.onFullscreenChange);
            window.addEventListener('music-account-changed', this.onAccountChange);
            this.applyBackground();
            this.sync();
        }

        /** 移动实际节点，以占位标记保留父节点、顺序及已有监听器。 */
        move(node, destination, before = null) {
            if (!node || !destination) return;
            const marker = document.createComment('播放页控件原位置');
            node.before(marker);
            this.moves.push({ node, marker });
            destination.insertBefore(node, before);
        }

        /** 根据原页面显隐状态切换布局，不接管历史导航或播放状态。 */
        sync() {
            const open = !this.view.classList.contains('hidden') && !this.view.classList.contains('opacity-0');
            if (open === this.open) return;
            this.open = open;
            window.closePlayerPopovers?.();
            document.body.classList.toggle('player-detail-open', open);
            if (open) {
                const root = document.getElementById('player-bar-root');
                const footer = document.getElementById('player-footer');
                const actions = footer.querySelector('.player-actions');
                const transport = footer.querySelector('.player-transport');
                const more = document.getElementById('player-more-btn').parentElement;
                this.move(root, this.left);
                this.move(document.getElementById('play-mode-btn').parentElement, transport, transport.firstElementChild);
                this.move(document.getElementById('player-volume-btn').parentElement, transport);
                this.move(document.getElementById('player-like-btn'), actions, more);
                actions.insertBefore(this.lyricsButton, more);
                this.move(actions.querySelector('[onclick="toggleQueueDrawer()"]'), actions, more);
                for (const item of [document.getElementById('btn-sound-effects'), document.querySelector('#player-more-menu [onclick*="toggleCommentModal"]')]) {
                    this.move(item, actions, more);
                    item.classList.add('player-detail-direct-action');
                    item.title = item.textContent.trim();
                    item.setAttribute('aria-label', item.title);
                }
                document.getElementById('player-more-menu').append(this.spectrumButton);
                this.applyBackground();
                this.updateTrack();
                this.updateSpectrum();
            } else {
                window.PlayerFeaturePages?.dismiss();
                this.lyricsButton.remove();
                this.spectrumButton.remove();
                for (const { node, marker } of this.moves.reverse()) {
                    node.classList.remove('player-detail-direct-action');
                    marker.replaceWith(node);
                }
                this.moves = [];
                if (this.ownsFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
                this.ownsFullscreen = false;
            }
            this.updateResponsiveLayout();
            window.playerBar?.updateScrollClearance();
            // 布局变化后只同步原画布尺寸，歌词滚动仍由原页面负责。
            window.musicVisualizer?.applySettings();
        }

        /** 展示原歌曲的专辑字段，读取现有数据且不改写歌曲对象。 */
        updateTrack(force = false) {
            const song = window.getActiveSongInfo?.() || window.currentPlayingSong;
            const album = window.getSongAlbumName?.(song) || '';
            this.album.textContent = album ? ' - ' + album : '';
            this.album.title = album;
            this.album.hidden = !album;
            if (this.view.getAttribute('data-player-background') === 'artist') this.background.update(song, force);
        }

        /** 手机调整歌词与频谱位置；歌曲标签始终跟在歌手和专辑后。 */
        updateResponsiveLayout() {
            const mobile = this.open && window.innerWidth < 768;
            if (mobile) {
                if (this.miniLyrics.parentElement !== this.left) this.coverStage.after(this.miniLyrics);
                if (this.visualizer.parentElement !== this.coverStage) this.coverStage.prepend(this.visualizer);
            } else {
                if (this.miniLyrics.parentElement !== this.lyricMarker.parentElement) this.lyricMarker.after(this.miniLyrics);
                if (this.visualizer.parentElement !== this.visualizerMarker.parentElement) this.visualizerMarker.after(this.visualizer);
            }
            document.getElementById('volume-container').setAttribute('aria-orientation', this.open ? 'vertical' : 'horizontal');
            if (!this.open) return;
            this.updateTrack();
        }

        /** 仅切换背景层，不改变页面布局、播放控件和歌曲数据。 */
        applyBackground(mode = window.settings?.playerBackground) {
            const value = window.PlayerBackground.normalizeMode(mode);
            if (this.view.getAttribute('data-player-background') !== value) this.background.clear();
            this.view.setAttribute('data-player-background', value);
            if (value === 'artist' && this.open) this.background.update(window.getActiveSongInfo?.() || window.currentPlayingSong);
        }

        /** 频谱入口仅调用原设置函数；画布与分析器由原模块管理。 */
        updateSpectrum() {
            const enabled = !!window.settings?.showDetailVisualizer;
            this.spectrumButton.setAttribute('aria-checked', String(enabled));
        }

        /** 全屏整个应用，使原有评论、队列及音效弹层在全屏时仍可见。 */
        async toggleFullscreen() {
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                    this.ownsFullscreen = true;
                } else window.showInfo?.('当前浏览器不支持全屏');
            } catch { window.showInfo?.('无法进入全屏，请检查浏览器权限'); }
            this.updateFullscreen();
        }

        /** 浏览器退出全屏时同步按钮图标、提示与无障碍状态。 */
        updateFullscreen() {
            const active = !!document.fullscreenElement;
            if (!active) this.ownsFullscreen = false;
            this.fullscreenButton.title = active ? '退出全屏' : '全屏';
            this.fullscreenButton.setAttribute('aria-label', this.fullscreenButton.title);
            this.fullscreenButton.setAttribute('aria-pressed', String(active));
            this.fullscreenButton.querySelector('i').className = 'fas fa-' + (active ? 'compress' : 'expand');
        }
    }
    window.PlayerDetailView = PlayerDetailView;
    const root = document.getElementById('player-detail-root');
    root.innerHTML = window.LXPlayerDetailTemplate;
    window.playerDetailView = new PlayerDetailView(document.getElementById('view-player-detail'));
    window.playerDetailView.mount();
})();
