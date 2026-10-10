/**
 * 歌词详情页频谱，与主题颜色同步。
 * @author yahyaoo
 */

const musicVisualizer = (function () {
    let audioContext, audioSource, audioAnalyser;
    let waveDetail;
    let isInitialized = false;

    const audio = document.getElementById('audio-player');
    const detailCanvas = document.getElementById('detail-visualizer');

    /**
     * 初始化音频上下文和频谱分析器。
     */
    function init() {
        if (isInitialized || !window.Wave || !audio || !detailCanvas) return;

        try {
            console.log('[Visualizer] Initializing AudioContext...');
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // 如果音效管理器已存在，使用它的分析器
            if (window.soundEffects && window.soundEffects.getAnalyser()) {
                audioAnalyser = window.soundEffects.getAnalyser();
                console.log('[Visualizer] Using analyser from SoundEffectsManager');
            } else {
                audioSource = audioContext.createMediaElementSource(audio);
                audioAnalyser = audioContext.createAnalyser();
                audioSource.connect(audioAnalyser);
                audioAnalyser.connect(audioContext.destination);
            }

            audioAnalyser.smoothingTimeConstant = 0.8;
            audioAnalyser.fftSize = 512;

            waveDetail = new Wave(audioAnalyser, detailCanvas);

            isInitialized = true;
            console.log('[Visualizer] Initialized successfully');

            syncSize();
            applySettings();
        } catch (e) {
            console.error('[Visualizer] Initialization failed:', e);
        }
    }

    /**
     * 按设备像素比同步画布分辨率。
     */
    function syncSize() {
        [detailCanvas].forEach(canvas => {
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        });
    }

    /**
     * 应用歌词详情页频谱设置。
     */
    function applySettings() {
        if (!isInitialized) return;

        // 每次应用设置前同步一次尺寸，确保全宽对齐
        syncSize();

        const s = window.settings || {};
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--c-500').trim() || '#10b981';
        const opacity = s.visualizerOpacity !== undefined ? s.visualizerOpacity : 0.5;
        const globalStyle = s.visualizerGlobalStyle || 'blocks';
        const globalGap = globalStyle === 'blocks' ? 2 : 0;

        // --- Handle Detail Visualizer ---
        waveDetail.clearAnimations();
        if (s.showDetailVisualizer && detailCanvas) {
            const style = s.detailVisualizerStyle || 'pulse';
            const options = {
                fillColor: themeColor,
                lineColor: themeColor,
                lineWidth: 1.5,
                count: 60,
                rounded: true,
                diameter: 220,
                gap: globalGap // 为 Pulse 等样式应用全局风格间距
            };

            let AnimationClass = waveDetail.animations.Turntable; // Default for 'pulse'

            if (style === 'dots') {
                AnimationClass = waveDetail.animations.Glob;
                options.diameter = 180;
            } else if (style === 'flower') {
                AnimationClass = waveDetail.animations.Flower;
                options.diameter = 200;
            }

            waveDetail.addAnimation(new AnimationClass(options));
            detailCanvas.style.opacity = opacity;
        } else if (detailCanvas) {
            detailCanvas.style.opacity = '0';
        }
    }

    /**
     * 手动清除可视化内容
     * @param {string} type 画布类型，仅详情页 detail 支持清除。
     */
    function clear(type) {
        if (type === 'detail' && waveDetail) {
            waveDetail.clearAnimations();
            if (detailCanvas) {
                const ctx = detailCanvas.getContext('2d');
                ctx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
            }
        }
    }

    if (audio) {
        audio.addEventListener('play', () => {
            if (!isInitialized) {
                init();
            } else if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
        });
    }

    window.addEventListener('resize', () => {
        syncSize();
        if (isInitialized) applySettings();
    });

    return { init, applySettings, syncSize, clear };
})();

window.musicVisualizer = musicVisualizer;
