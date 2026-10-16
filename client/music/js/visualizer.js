/**
 * 歌词详情页频谱，与主题颜色同步。
 * @author yahyaoo
 */

const musicVisualizer = (function () {
    let audioContext, audioSource, audioAnalyser;
    let waveDetail;
    let isInitialized = false;
    let frame = null, drawing = [], dataArray, context, viewObserver, sizeObserver;

    const audio = document.getElementById('audio-player');
    const detailCanvas = document.getElementById('detail-visualizer');

    /**
     * 初始化音频上下文和频谱分析器。
     */
    function init() {
        if (isInitialized || !window.Wave || !audio || !detailCanvas) return;

        try {
            console.log('[Visualizer] Initializing AudioContext...');

            // 如果音效管理器已存在，使用它的分析器
            if (window.soundEffects && window.soundEffects.getAnalyser()) {
                audioAnalyser = window.soundEffects.getAnalyser();
                console.log('[Visualizer] Using analyser from SoundEffectsManager');
            } else {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                audioSource = audioContext.createMediaElementSource(audio);
                audioAnalyser = audioContext.createAnalyser();
                audioSource.connect(audioAnalyser);
                audioAnalyser.connect(audioContext.destination);
            }

            audioAnalyser.smoothingTimeConstant = 0.8;
            audioAnalyser.fftSize = 512;

            // 当前随仓库交付的Wave在空输入时只提供动画构造器，不启动音频或rAF。
            // 不改vendor：各动画的公开draw接口交给此模块唯一、可停止的显示循环。
            waveDetail = new Wave(null, detailCanvas);
            context = detailCanvas.getContext('2d');
            dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);

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
            const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
        });
    }

    /**
     * 应用歌词详情页频谱设置。
     */
    function applySettings() {
        const s = window.settings || {};
        const style = ['spectrum', 'pulse', 'dots', 'flower'].includes(s.detailVisualizerStyle) ? s.detailVisualizerStyle : 'spectrum';
        const view = document.getElementById('view-player-detail');
        // 画布尺寸先随所选效果切换，未播放时也能正确预览页面布局。作者：jingyh
        if (view) view.dataset.playerVisualizer = style;
        if (detailCanvas) detailCanvas.style.opacity = s.showDetailVisualizer ? (s.visualizerOpacity ?? 0.5) : '0';
        if (!isInitialized) return;

        // 每次应用设置前同步一次尺寸，确保全宽对齐
        syncSize();

        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--c-500').trim() || '#10b981';
        const opacity = s.visualizerOpacity !== undefined ? s.visualizerOpacity : 0.5;
        const globalStyle = s.visualizerGlobalStyle || 'blocks';
        const globalGap = globalStyle === 'blocks' ? 2 : 0;

        // --- Handle Detail Visualizer ---
        waveDetail.clearAnimations();
        drawing = [];
        if (s.showDetailVisualizer && detailCanvas) {
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

            // 现有底部频谱作为独立选项，其他效果沿用原绘制器与分析器。作者：jingyh
            if (style === 'spectrum' && window.PlayerDetailSpectrum) {
                AnimationClass = window.PlayerDetailSpectrum;
            }

            const animation = new AnimationClass(options);
            waveDetail.addAnimation(animation); drawing = [animation];
            detailCanvas.style.opacity = opacity;
        } else if (detailCanvas) {
            detailCanvas.style.opacity = '0';
        }
        syncLifecycle();
    }

    /**
     * 手动清除可视化内容
     * @param {string} type 画布类型，仅详情页 detail 支持清除。
     */
    function clear(type) {
        if (type === 'detail' && waveDetail) {
            waveDetail.clearAnimations();
            drawing = []; stop();
            if (detailCanvas) {
                const ctx = detailCanvas.getContext('2d');
                ctx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
            }
        }
    }

    function visible() {
        const view = document.getElementById('view-player-detail');
        return !document.hidden && detailCanvas?.isConnected !== false && !detailCanvas?.hidden &&
            !view?.classList?.contains('hidden') && !view?.classList?.contains('opacity-0') && !!window.settings?.showDetailVisualizer;
    }
    function stop() { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
    function draw() {
        frame = null;
        if (!isInitialized || audio.paused || !visible() || !drawing.length) return;
        if (dataArray.length !== audioAnalyser.frequencyBinCount) dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        audioAnalyser.getByteFrequencyData(dataArray);
        context.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
        for (const animation of drawing) animation.draw(dataArray, context);
        frame = requestAnimationFrame(draw);
    }
    function syncLifecycle() {
        if (!isInitialized || audio?.paused || !visible() || !drawing.length) { stop(); return; }
        if (frame === null) frame = requestAnimationFrame(draw);
    }
    const onPlay = () => {
            if (!isInitialized) {
                init();
            } else if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            syncLifecycle();
    };
    const onResize = () => {
        if (!visible()) return;
        const measure = () => null, write = () => { syncSize(); if (isInitialized) applySettings(); };
        if (window.ClientPerformance?.scheduleLayout) window.ClientPerformance.scheduleLayout(musicVisualizer, measure, write);
        else write();
    };
    if (audio) { audio.addEventListener('play', onPlay); for (const event of ['playing', 'pause', 'ended', 'emptied']) audio.addEventListener(event, syncLifecycle); }
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener?.('visibilitychange', syncLifecycle);
    if (typeof MutationObserver !== 'undefined') {
        viewObserver = new MutationObserver(() => { if (visible()) onResize(); syncLifecycle(); });
        const view = document.getElementById('view-player-detail'); if (view) viewObserver.observe(view, { attributes: true, attributeFilter: ['class'] });
    }
    if (typeof ResizeObserver !== 'undefined' && detailCanvas) { sizeObserver = new ResizeObserver(onResize); sizeObserver.observe(detailCanvas); }
    function destroy() {
        stop(); drawing = []; viewObserver?.disconnect(); sizeObserver?.disconnect();
        audio?.removeEventListener('play', onPlay); for (const event of ['playing', 'pause', 'ended', 'emptied']) audio?.removeEventListener(event, syncLifecycle);
        window.removeEventListener('resize', onResize); document.removeEventListener?.('visibilitychange', syncLifecycle);
        window.removeEventListener('pageshow', syncLifecycle);
        window.ClientPerformance?.cancelLayout(musicVisualizer);
    }
    window.addEventListener('pagehide', event => { stop(); if (!event.persisted) destroy(); });
    window.addEventListener('pageshow', syncLifecycle);

    return { init, applySettings, syncSize, clear, syncLifecycle, destroy, get activeLoop() { return frame !== null; } };
})();

window.musicVisualizer = musicVisualizer;
