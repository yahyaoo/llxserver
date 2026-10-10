/** 底部播放栏组件，负责挂载、弹框与显示更新。 @author yahyaoo */
(function () {
    const panels = {
        more: ['player-more-menu', 'player-more-btn'],
        volume: ['player-volume-popover', 'player-volume-btn'],
    };

    class PlayerBar {
        constructor() {
            this.root = null;
            this.onDocumentClick = event => {
                if (!event.target.closest('[data-player-popover]')) this.closePopovers();
                if (event.target.closest('[data-player-action]')) this.closePopovers();
            };
            this.onDocumentKeydown = event => {
                if (event.key === 'Escape') this.closePopovers(true);
            };
            this.onVolumeKeydown = event => {
                const changes = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 };
                if (!(event.key in changes) && event.key !== 'Home' && event.key !== 'End') return;
                event.preventDefault();
                event.stopPropagation();
                // 原播放器负责音量更新和持久化，组件仅传递操作。作者：yahyaoo
                if (event.key === 'Home') changeVolume(-1);
                else if (event.key === 'End') changeVolume(1);
                else changeVolume(changes[event.key]);
            };
        }

        /** 同步挂载，保证旧播放器初始化时能找到原有控件 ID。 */
        mount(root) {
            if (!root || this.root === root) return;
            this.destroy();
            root.innerHTML = window.LXPlayerBarTemplate;
            this.root = root;
            root.classList.add('player-bar-host');
            document.body.classList.add('player-bar-floating');
            document.getElementById('player-volume-popover').inert = true;
            document.addEventListener('click', this.onDocumentClick);
            document.addEventListener('keydown', this.onDocumentKeydown);
            document.getElementById('volume-container')?.addEventListener('keydown', this.onVolumeKeydown);
        }

        /** 卸载组件并释放事件，不更改音频状态。 */
        destroy() {
            if (!this.root) return;
            document.removeEventListener('click', this.onDocumentClick);
            document.removeEventListener('keydown', this.onDocumentKeydown);
            document.getElementById('volume-container')?.removeEventListener('keydown', this.onVolumeKeydown);
            this.root.innerHTML = '';
            this.root.classList.remove('player-bar-host');
            document.body.classList.remove('player-bar-floating');
            this.root = null;
        }

        /** 音量在栏内展开时，左侧菜单淡出并暂时退出键盘焦点顺序。 */
        setVolumeExpanded(expanded) {
            const actions = this.root?.querySelector('.player-actions');
            if (!actions) return;
            if (expanded) actions.classList.add('volume-open');
            else actions.classList.remove('volume-open');
            for (const child of actions.children || []) {
                if (!child.classList.contains('player-volume-anchor')) child.inert = expanded;
            }
        }

        /** 关闭弹框，可将键盘焦点返回打开弹框的按钮。 */
        closePopovers(restoreFocus = false) {
            for (const [panelId, triggerId] of Object.values(panels)) {
                const panel = document.getElementById(panelId);
                const trigger = document.getElementById(triggerId);
                if (!panel || !trigger) continue;
                const wasOpen = !panel.hidden;
                panel.hidden = true;
                panel.inert = true;
                trigger.setAttribute('aria-expanded', 'false');
                if (wasOpen && restoreFocus) trigger.focus();
            }
            this.setVolumeExpanded(false);
        }

        /** 同时只打开一个弹框，将焦点放到首个可操作控件。 */
        togglePopover(name) {
            const ids = panels[name];
            if (!ids) return;
            const panel = document.getElementById(ids[0]);
            if (!panel) return;
            const shouldOpen = panel.hidden;
            this.closePopovers();
            for (const id of ['play-mode-menu', 'playback-rate-menu']) {
                document.getElementById(id)?.classList.remove('force-visible');
            }
            if (shouldOpen) {
                panel.hidden = false;
                panel.inert = false;
                this.setVolumeExpanded(name === 'volume');
                document.getElementById(ids[1])?.setAttribute('aria-expanded', 'true');
                panel.querySelector('button, [tabindex="0"]')?.focus();
            }
        }

        /** 根据业务层传入的音量和静音状态更新显示，不写入音频或存储。 */
        updateVolume(volume, muted) {
            const displayVolume = muted ? 0 : volume;
            const percent = Math.round(displayVolume * 100);
            const bar = document.getElementById('volume-bar');
            const label = document.getElementById('volume-percent');
            const icon = document.getElementById('volume-icon');
            if (bar) bar.style.width = `${displayVolume * 100}%`;
            if (label) label.textContent = percent + '%';
            document.getElementById('volume-container')?.setAttribute('aria-valuenow', String(percent));
            document.getElementById('player-volume-btn')?.setAttribute('aria-label', '音量 ' + percent + '%');
            if (icon) {
                const level = muted || volume === 0 ? 'mute' : volume < 0.5 ? 'down' : 'up';
                icon.className = 'fas fa-volume-' + level + ' w-4';
            }
        }
    }

    window.PlayerBar = PlayerBar;
    window.playerBar = new PlayerBar();
    window.togglePlayerPopover = name => window.playerBar.togglePopover(name);
    window.closePlayerPopovers = restoreFocus => window.playerBar.closePopovers(restoreFocus);
    window.playerBar.mount(document.getElementById('player-bar-root'));
})();
