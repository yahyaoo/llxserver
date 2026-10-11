/** 公共播放时长统计与次数排序工具。 @author jingyh @date 2026-10-11 */
(function (root) {
    const playCount = song => Number.isSafeInteger(song.playCount) && song.playCount >= 0 ? song.playCount : 0;
    /** 次数相同时按最后播放时间降序排列；不修改调用方数组。 */
    const sortByPlayCount = songs => songs.slice().sort((a, b) => playCount(b) - playCount(a) || (b.playedAt || 0) - (a.playedAt || 0));
    // NAS 的普通 HTTP 页面没有 randomUUID 时，使用同样可用的随机字节生成会话标识。
    const playbackId = () => root.crypto.randomUUID?.() || Array.from(root.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

    /** 绑定主音频事件，每次播放只上报一次；预读音频不参与统计。 */
    class PlaybackTracker {
        /** @param audio 主播放器。 @param options 提供有效播放回调和可替换时钟。 */
        constructor(audio, { onQualified, now = () => performance.now() }) {
            this.audio = audio;
            this.onQualified = onQualified;
            this.now = now;
            this.session = null;
            audio.addEventListener('playing', () => this.resume());
            audio.addEventListener('timeupdate', () => this.sample());
            audio.addEventListener('pause', () => this.suspend());
            audio.addEventListener('waiting', () => this.suspend());
            audio.addEventListener('seeking', () => this.suspend(false));
            audio.addEventListener('seeked', () => this.resume());
            audio.addEventListener('ratechange', () => this.suspend(false));
            audio.addEventListener('ratechange', () => this.resume());
            audio.addEventListener('error', () => this.suspend(false));
            audio.addEventListener('emptied', () => this.suspend(false));
            audio.addEventListener('ended', () => this.suspend());
        }

        /** 准备播放会话；同曲换源或换音质保留累计时间和已计数状态。 */
        prepare(song, quality, preserve = false) {
            const identity = `${song.source}:${song.id}`;
            if (!preserve || this.session?.identity !== identity) {
                this.session = { identity, seconds: 0, succeeded: false, counted: false, sample: null,
                    playbackId: playbackId() };
            }
            this.session.song = { ...song };
            this.session.quality = quality;
            this.session.sample = null;
        }

        /** 成功输出音频后开始采样；暂停、缓冲和拖动期间不能开始。 */
        resume() {
            if (!this.session || this.audio.paused || this.audio.ended || this.audio.seeking || this.audio.error || this.audio.readyState < 3) return;
            this.session.succeeded = true;
            this.session.sample = { time: this.audio.currentTime, wall: this.now(), rate: this.audio.playbackRate || 1 };
        }

        /** 以音频进度和真实经过时间的较小值累计，跳转不能冒充正常播放。 */
        sample() {
            const session = this.session;
            if (!session?.sample || this.audio.seeking || this.audio.error) return;
            const wall = this.now(), time = this.audio.currentTime;
            const elapsed = Math.max(0, (wall - session.sample.wall) / 1000);
            const progress = Math.max(0, (time - session.sample.time) / session.sample.rate);
            session.seconds += Math.min(elapsed, progress);
            session.sample = { time, wall, rate: this.audio.playbackRate || 1 };
            if (!session.counted && session.succeeded && session.seconds > 10) {
                // 先锁定会话，再交给异步上报，后续进度事件不会重复发请求。
                session.counted = true;
                this.onQualified(session.song, session.quality, {
                    playbackSucceeded: true, playedSeconds: session.seconds, playbackId: session.playbackId,
                });
            }
        }

        /** 停止累计；拖动、媒体错误和替换音源时丢弃尚未采样的间隔。 */
        suspend(collect = true) {
            if (collect) this.sample();
            if (this.session) this.session.sample = null;
        }

        /** 账号变化时放弃旧会话，防止统计写入其他账号。 */
        reset() { this.session = null; }
    }

    root.PlayStatistics = { PlaybackTracker, playCount, sortByPlayCount };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.PlayStatistics;
})(typeof window === 'undefined' ? globalThis : window);
