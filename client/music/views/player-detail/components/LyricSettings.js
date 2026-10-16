/** 播放页歌词设置弹框，复用原控件与即时保存入口。 @author jingyh @date 2026-10-10 */
(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'lyric-settings-dialog';
    dialog.className = 'lyric-settings-dialog t-bg-panel t-text-main';
    dialog.setAttribute('aria-labelledby', 'lyric-settings-title');
    dialog.innerHTML = String.raw`
        <header class="lyric-settings-header">
            <div><h2 id="lyric-settings-title">歌词显示设置</h2><p class="t-text-muted">修改后立即生效</p></div>
            <button type="button" class="player-icon-button" data-lyric-settings-close aria-label="关闭歌词显示设置"><i class="fas fa-times" aria-hidden="true"></i></button>
        </header>
        <div class="lyric-settings-content custom-scrollbar">
        <!-- 歌词显示设置 -->
        <div class="space-y-4">

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                <!-- Lyric Font Size -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow col-span-full">
                    <div
                        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                        <h4 class="text-sm font-bold t-text-main flex items-center mb-0 shrink-0">
                            <i class="fas fa-font mr-2 text-emerald-500"></i> 歌词字体大小
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">设置播放详情页歌词显示的大小 (单位:
                                    rem)</span>
                            </span>
                        </h4>
                        <div class="flex items-center gap-3 flex-1">
                            <input type="range" id="lyric-font-size-slider" aria-label="歌词字体大小"
                                class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                min="0.8" max="3.0" step="0.1" value="1.2"
                                oninput="changeLyricFontSize(this.value)">
                            <span id="lyric-font-size-value"
                                class="text-sm font-mono text-emerald-600 w-8 text-right">1.2</span>
                        </div>
                    </div>
                </div>

                <!-- Lyric Glow Toggle -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold t-text-main flex items-center">
                                歌词荧光效果
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">为当前播放的歌词添加荧光发光效果。</span>
                                </span>
                            </h4>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-enable-lyric-glow" aria-label="歌词荧光效果"
                                class="sr-only peer"
                                onchange="updateSetting('enableLyricGlow', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Lyric Translation Toggle -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold t-text-main flex items-center">
                                显示歌词翻译
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">如果歌曲有翻译，则在原词下方显示。</span>
                                </span>
                            </h4>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-show-lyric-translation" aria-label="显示歌词翻译"
                                class="sr-only peer"
                                onchange="updateSetting('showLyricTranslation', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Lyric Roma Toggle -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold t-text-main flex items-center">
                                显示歌词罗马音
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">如果歌曲有罗马音，则在原词下方显示。</span>
                                </span>
                            </h4>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-show-lyric-roma" aria-label="显示歌词罗马音" class="sr-only peer"
                                onchange="updateSetting('showLyricRoma', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Swap Trans Roma Toggle -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold t-text-main flex items-center">
                                交换翻译与罗马音位置
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">开启后，罗马音将显示在翻译上方。</span>
                                </span>
                            </h4>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-swap-lyric-trans-roma" aria-label="交换翻译与罗马音位置"
                                class="sr-only peer"
                                onchange="updateSetting('swapLyricTransRoma', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Lyric Font Family -->
            <div
                class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow col-span-full">
                <h3 class="font-bold t-text-main text-sm mb-3 flex items-center">
                    <i class="fas fa-font mr-2 text-emerald-500"></i> 歌词字体
                    <span class="setting-tooltip-trigger">
                        <i class="fas fa-question-circle"></i>
                        <span class="setting-tooltip-content">设置歌词显示的字体 (支持本地安装的字体，如
                            'SimHei',
                            'Microsoft YaHei')</span>
                    </span>
                </h3>
                <div class="flex items-center justify-between gap-4">
                    <div class="relative flex-1">
                        <select id="lyric-font-family-select" aria-label="歌词字体" data-native-select class="lm-select !w-full !py-1.5"
                            onchange="changeLyricFontFamily(this.value)">
                            <option value="">默认字体</option>
                            <optgroup label="所有设备可用">
                                <option value="sans-serif">系统无衬线</option>
                                <option value="serif">系统衬线</option>
                                <option value="monospace">等宽字体</option>
                            </optgroup>
                            <optgroup label="常用中文字体">
                                <option value="Microsoft YaHei">微软雅黑 (Microsoft YaHei)</option>
                                <option value="SimHei">黑体 (SimHei)</option>
                                <option value="KaiTi">楷体 (KaiTi)</option>
                                <option value="SimSun">宋体 (SimSun)</option>
                                <option value="FangSong">仿宋 (FangSong)</option>
                            </optgroup>
                            <optgroup label="常用英文字体">
                                <option value="Arial">Arial</option>
                                <option value="Segoe UI">Segoe UI</option>
                                <option value="Times New Roman">Times New Roman</option>
                                <option value="Roboto">Roboto</option>
                            </optgroup>
                        </select>
                    </div>
                    <button onclick="loadLocalFonts()"
                        class="px-3 py-1.5 t-bg-track hover:bg-gray-200 t-text-muted rounded-lg text-xs transition-colors whitespace-nowrap shrink-0"
                        title="尝试读取系统安装的所有字体 (需要浏览器支持)">
                        <i class="fas fa-sync-alt mr-1"></i>读取
                    </button>
                </div>
                <!-- Font Preview Panel -->
                <div
                    class="mt-4 p-4 t-bg-main rounded-lg border t-border-main text-center transition-all duration-300">
                    <div class="text-xs t-text-muted mb-2">字体预览</div>
                    <div id="lyric-font-preview"
                        style="font-family: var(--lyric-font-family, inherit);">
                        <div class="text-xl font-bold t-text-main break-words tracking-widest mb-2">
                            0123456789
                        </div>
                        <div class="text-lg t-text-main break-words mb-2">
                            The Quick Brown Fox Jumps Over The Lazy Dog
                        </div>
                        <div class="text-2xl font-medium t-text-main break-words">
                            落霞与孤鹜齐飞，秋水共长天一色
                        </div>
                    </div>
                    <p class="text-xs t-text-muted mt-2">手机建议选择系统字体；指定字体需要在当前设备安装。</p>
                </div>
            </div>
        </div>

        </div>
    `;
    document.body.append(dialog);

    /** 关闭弹框，已修改配置由原设置入口即时保存。 @author jingyh */
    function close() {
        if (dialog.open) dialog.close();
    }

    /** 打开前同步最新设置，不创建副本或重建已选字体。 @author jingyh */
    function open() {
        window.closePlayerPopovers?.();
        window.syncSettingsUI?.();
        if (!dialog.open) dialog.showModal();
    }
    dialog.querySelector('[data-lyric-settings-close]')?.addEventListener('click', close);
    dialog.addEventListener('close', () => document.getElementById('player-more-btn')?.focus());
    // 原生对话框处理 Esc 和焦点约束；只有点击遮罩区域才关闭。
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    window.lyricSettings = { open, close };
})();
