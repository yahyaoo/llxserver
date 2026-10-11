/** 队列外观、切歌过渡与音量渐变；设置保存仍由原播放器负责。 @author jingyh @date 2026-10-11 */
(function () {
    class PlaybackExperience {
        constructor() {
            this.pendingFade = null;
            this.trackKey = null;
            this.animations = [];
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') this.closeQueueSettings();
            });
            document.addEventListener('click', event => {
                const panel = document.getElementById('queue-settings-panel');
                const button = document.getElementById('queue-settings-button');
                if (panel && !panel.hidden && !panel.contains(event.target) && !button?.contains(event.target)) this.closeQueueSettings();
            });
        }

        /** 背景不透明度采用 0–1；非法旧配置回退到清晰的默认值。 @author jingyh */
        static normalizeOpacity(value) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0.95;
        }

        /** 时长单位为毫秒，保护拖动、账号回读和导入配置的范围。 @author jingyh */
        static normalizeDuration(value) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.min(15000, Math.max(100, Math.round(number))) : 1000;
        }

        /** 两处滑块共用一个设置，只降低背景透明度，不降低文字和按钮透明度。 @author jingyh */
        syncOpacity(value) {
            const opacity = PlaybackExperience.normalizeOpacity(value);
            document.getElementById('queue-drawer')?.style.setProperty('--queue-opacity', String(opacity));
            for (const id of ['setting-queue-opacity', 'queue-opacity-slider']) {
                const input = document.getElementById(id);
                if (input) input.value = String(opacity);
            }
            for (const id of ['setting-queue-opacity-value', 'queue-opacity-value']) {
                const output = document.getElementById(id);
                if (output) output.textContent = Math.round(opacity * 100) + '%';
            }
        }

        /** 以秒显示毫秒时长，5 秒等整数值不显示多余小数。 @author jingyh */
        syncDuration(value) {
            const duration = PlaybackExperience.normalizeDuration(value);
            const input = document.getElementById('setting-crossfade-duration');
            const output = document.getElementById('crossfade-duration-value');
            if (input) input.value = String(duration);
            if (output) output.textContent = Number((duration / 1000).toFixed(3)) + ' 秒';
        }

        /** 关闭效果保留时长，下次打开继续使用；当前渐变立即结束。 @author jingyh */
        syncCrossfade(enabled) {
            const input = document.getElementById('setting-crossfade-duration');
            if (input) input.disabled = !enabled;
            if (!enabled) this.cancelFade();
        }

        /** 队列内展开独立设置区，不退出当前播放页。 @author jingyh */
        toggleQueueSettings() {
            const panel = document.getElementById('queue-settings-panel');
            if (!panel) return;
            panel.hidden = !panel.hidden;
            document.getElementById('queue-settings-button')?.setAttribute('aria-expanded', String(!panel.hidden));
        }

        /** 点击外部、Esc 或关闭队列时还原展开状态。 @author jingyh */
        closeQueueSettings() {
            const panel = document.getElementById('queue-settings-panel');
            if (panel) panel.hidden = true;
            document.getElementById('queue-settings-button')?.setAttribute('aria-expanded', 'false');
        }

        /** 同一歌曲的音质刷新不重播动画；切歌取消旧动画，尊重系统减少动态效果设置。 @author jingyh */
        transitionTrack(song) {
            const key = JSON.stringify([song?.source, song?.songmid || song?.id, song?.name, song?.singer]);
            if (key === this.trackKey) return;
            this.trackKey = key;
            this.animations.forEach(animation => animation.cancel());
            this.animations = [];
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
            for (const id of ['detail-cover', 'player-cover', 'player-title', 'player-artist', 'lyric-content']) {
                const element = document.getElementById(id);
                if (!element?.animate) continue;
                this.animations.push(element.animate([
                    { opacity: 0.35, transform: 'translateY(10px)' },
                    { opacity: 1, transform: 'translateY(0)' },
                ], { duration: 420, easing: 'cubic-bezier(.22,.7,.3,1)' }));
            }
        }

        /** 取消时结束旧 Promise，防止快速切歌或手动调音量留下悬挂的等待。 @author jingyh */
        cancelFade() {
            const pending = this.pendingFade;
            if (!pending) return;
            this.pendingFade = null;
            clearInterval(pending.timer);
            pending.resolve(false);
        }

        /**
         * 按实际经过时间插值音量，长渐变仍保持平滑，后台节流后直接追上正确进度。
         * @param {HTMLAudioElement} audio 原播放器音频元素。
         * @param {number} targetVolume 目标音量，限制在 0–1。
         * @param {number} duration 淡入或淡出时长，单位毫秒。
         * @returns {Promise<boolean>} 完成返回 true，被新操作取消返回 false。
         * @author jingyh
         */
        fade(audio, targetVolume, duration) {
            this.cancelFade();
            const target = Math.min(1, Math.max(0, Number(targetVolume) || 0));
            const start = audio.volume;
            if (start === target) return Promise.resolve(true);
            const length = PlaybackExperience.normalizeDuration(duration);
            const started = performance.now();
            return new Promise(resolve => {
                const pending = { resolve, timer: null };
                this.pendingFade = pending;
                pending.timer = setInterval(() => {
                    if (this.pendingFade !== pending) return;
                    const progress = Math.min(1, (performance.now() - started) / length);
                    audio.volume = start + (target - start) * progress;
                    if (progress >= 1) {
                        clearInterval(pending.timer);
                        this.pendingFade = null;
                        audio.volume = target;
                        resolve(true);
                    }
                }, 16);
            });
        }
    }
    window.PlaybackExperience = PlaybackExperience;
    window.playbackExperience = new PlaybackExperience();
})();
