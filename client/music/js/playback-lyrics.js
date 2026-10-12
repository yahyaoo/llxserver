/** 播放器共用歌词会话：统一请求、解析结果与行号，展示组件只订阅状态。 @author jingyh @date 2026-10-12 */
(function () {
    class PlaybackLyrics {
        constructor() {
            this.version = 0;
            this.listeners = new Set();
            this.state = { lines: [], index: -1, message: '暂无歌词' };
        }

        /** 歌曲身份不包含可更新的标题、歌手和专辑；本地文件按目录与账号区分。 */
        static identify(song) {
            const source = song.source || song.meta?.source || '';
            const songmid = song.songmid || song.songId || song.meta?.songmid || song.meta?.songId;
            const filename = song._localFilename || song.customFilename || song.filename;
            return { source, songmid, key: JSON.stringify(filename
                ? ['file', source, songmid || '', song._localUsername || '', song._localFolder || song.folder || '', filename]
                : [source, songmid || song.id || '', songmid || song.id ? '' : song.name || '']) };
        }

        /** 各缓存和平台接口的字段统一为同一种原始歌词结构。 */
        static normalize(data = {}) {
            return { lrc: data.lyric || data.lrc || '', tlyric: data.tlyric || '',
                rlyric: data.rlyric || '', klyric: data.klyric || data.lxlyric || '' };
        }

        /** 同曲请求共用进行中的任务；旧歌曲的响应不再更新当前歌词。 */
        load(song, loader, apply, reset, fail) {
            const account = window.MusicExperience?.account || '';
            // 同曲补齐平台查询参数后重新获取，避免缺少 hash 时的空结果被继续复用。作者：yahyaoo
            const query = ['hash', 'copyrightId', 'lrcUrl', 'mrcUrl', 'trcUrl'].map(field => song[field] || song.meta?.[field] || '');
            const key = JSON.stringify([account, PlaybackLyrics.identify(song).key, query]);
            if (this.key === key && (this.pending || this.ready)) return this.pending || Promise.resolve();
            this.key = key;
            this.ready = false;
            const version = ++this.version;
            reset();
            const pending = Promise.resolve().then(async () => {
                try {
                    const data = await loader(song);
                    if (version !== this.version || account !== (window.MusicExperience?.account || '')) return;
                    apply(data);
                    this.ready = true;
                } catch (error) {
                    if (version === this.version && account === (window.MusicExperience?.account || '')) fail(error);
                } finally {
                    if (version === this.version) this.pending = null;
                }
            });
            this.pending = pending;
            return pending;
        }

        /** 发布同一份解析结果；底栏与播放页共用数组和时间轴。 */
        setLines(lines, message = '暂无歌词') {
            this.state = { lines, index: -1, message };
            this.publish();
        }
        setIndex(index) { if (this.state.index === index) return; this.state.index = index; this.publish(); }
        publish() { for (const listener of this.listeners) listener(this.state); }
        subscribe(listener) {
            this.listeners.add(listener);
            listener(this.state);
            return () => this.listeners.delete(listener);
        }
    }
    window.PlaybackLyrics = PlaybackLyrics;
    window.playbackLyrics = new PlaybackLyrics();
})();
