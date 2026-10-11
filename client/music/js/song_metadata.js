/** 歌曲文件大小与音频参数的公共展示，不请求平台数据。 @author jingyh */
(() => {
    const positive = value => {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    };

    /** 数字大小按字节处理，平台带单位的字符串按明确单位转换。 */
    function formatSize(value) {
        let bytes = positive(value);
        if (!bytes && typeof value === 'string') {
            const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|K|M|G|KB|MB|GB|KiB|MiB|GiB)$/i);
            if (match) bytes = positive(match[1]) * 1024 ** ({ b: 0, k: 1, m: 2, g: 3 }[match[2][0].toLowerCase()]);
        }
        if (!bytes) return '';
        const unit = Math.min(3, Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))));
        return `${Number((bytes / 1024 ** unit).toFixed(1))} ${['B', 'KB', 'MB', 'GB'][unit]}`;
    }

    /** 优先使用实际文件参数；只有未确定音质时才使用最高的具体音质记录。 */
    function values(song = {}) {
        const meta = song.meta || {};
        const candidates = [];
        for (const source of [song.types, song._types, song.qualitys, song._qualitys, meta.qualitys, meta._qualitys]) {
            if (Array.isArray(source)) candidates.push(...source);
            else if (source && typeof source === 'object') {
                for (const [type, value] of Object.entries(source)) {
                    if (value && typeof value === 'object') candidates.push({ ...value, type: value.type || type });
                }
            }
        }
        const rank = ['master', 'atmos_plus', 'atmos', 'flac24bit', 'hires', 'flac', '320k', '128k'];
        const quality = song.quality || meta.quality || song.type;
        const details = candidates.filter(value => value && !value.isPlatformQuality && (!quality || value.type === quality))
            .sort((a, b) => (rank.indexOf(a.type) < 0 ? 99 : rank.indexOf(a.type)) - (rank.indexOf(b.type) < 0 ? 99 : rank.indexOf(b.type)));
        const selectedType = details[0]?.type;
        const concrete = details.filter(value => value.type === selectedType);
        const pick = keys => {
            for (const value of [song, meta, ...concrete]) for (const key of keys) {
                if (value[key] !== undefined && value[key] !== null && value[key] !== '' && value[key] !== 0) return value[key];
            }
            return null;
        };
        const size = formatSize(pick(['size', 'fileSize']));
        const depth = positive(pick(['bitDepth', 'bitsPerSample']));
        const rate = positive(pick(['sampleRate', 'samplingRate']));
        const bitrate = positive(pick(['bitrate']));
        return [size, depth ? `${depth}bit` : '', rate ? `${Number((rate / 1000).toFixed(2))}kHz` : '', bitrate ? `${Math.round(bitrate)}kbps` : ''].filter(Boolean);
    }

    /** 只插入经过数值归一化的内容，避免远端元数据进入 HTML。 */
    function render(song) {
        return values(song).map(value => `<span class="song-audio-spec">${value}</span>`).join('');
    }

    window.SongMetadata = { values, formatSize, render };
})();
