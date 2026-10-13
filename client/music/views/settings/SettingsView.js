/**
 * 设置页面组件，集中维护页面模板并在业务脚本执行前挂载。
 * 原有控件 ID 和事件保持不变，切换分组不会重新挂载控件。
 * @author yahyaoo
 * @date 2026-10-10
 */
(() => {
    const template = `
<div id="settings-shell" class="settings-shell">
    <button type="button" id="settings-mobile-toggle" class="settings-mobile-toggle" onclick="toggleSettingsMobileNavigation()" aria-expanded="false" aria-controls="settings-sidebar">
        <i class="fas fa-sliders-h" aria-hidden="true"></i><span>设置目录</span><span id="settings-mobile-label">源与基础设置</span><i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>
    <aside id="settings-sidebar" class="settings-sidebar" aria-label="设置导航">
        <h2 class="settings-sidebar-title">设置</h2>
        <nav id="settings-navigation" class="settings-navigation custom-scrollbar" aria-label="设置分组"></nav>
        <button type="button" id="settings-collapse" class="settings-collapse" onclick="toggleSettingsNavigation()" aria-expanded="true" aria-controls="settings-navigation" aria-label="收起设置导航" title="收起设置导航">
            <i class="fas fa-angle-double-left" aria-hidden="true"></i><span>收起</span>
        </button>
    </aside>
    <div id="settings-content" class="settings-content custom-scrollbar">
        <div class="settings-content-inner">
            <div class="settings-content-heading"><h2 id="settings-section-title">源与基础设置</h2></div>
    <!-- System Settings Panel -->
    <div id="settings-panel-system" class="space-y-6 animate-fade-in">
        <div id="settings-section-advanced" data-settings-section="advanced" class="settings-form-card hidden">
            <h3>高级</h3>
            <label class="settings-field">状态上报方式
                <select id="setting-client-sync-transport" class="settings-text-input" onchange="updateSetting('clientSyncTransport', this.value)">
                    <option value="ws">WebSocket（默认，不可用时回退 HTTP）</option>
                    <option value="http">HTTP</option>
                </select>
            </label>
            <p class="account-field-hint">每 30 秒合并上报实际变化，服务端数据与进度通过长连接推送。</p>
        </div>
        <!-- 源与基础设置 -->
        <div id="settings-section-sources" data-settings-section="sources" class="col-span-full pt-2 space-y-4">
            <h4 class="text-sm font-bold t-text-main flex items-center">
                <i class="fas fa-server mr-2 text-emerald-500"></i> 源与基础设置
            </h4>

            <!-- 自定义源管理 -->
            <div
                class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                <!-- Header row: title + auth tags + manage button -->
                <div class="flex flex-wrap items-center gap-2 mb-4">
                    <h3 class="font-bold text-emerald-500 flex items-center gap-2">
                        <i class="fas fa-plug text-sm"></i> 自定义源
                    </h3>
                    <div id="settings-source-scope-tag" class="hidden flex items-center gap-1">
                    </div>
                    <span id="settings-admin-tag"
                        class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-500 whitespace-nowrap hidden">管理员</span>
                    <button id="btn-admin-logout" onclick="handleAdminLogout()"
                        class="text-[10px] px-3 py-1 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-all border border-red-100 hidden">退出管理员</button>
                    <button id="btn-admin-login" onclick="handleAdminLogin()"
                        class="text-[10px] px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-all border border-emerald-100 flex items-center gap-1.5 hidden">
                        <i class="fas fa-user-shield"></i> 管理员登录
                    </button>
                    <button id="btn-custom-source-manage" onclick="openCustomSourceModal()"
                        class="ml-auto flex-shrink-0 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg shadow shadow-emerald-200/50 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5">
                        <i class="fas fa-plus-circle"></i> 管理 / 添加
                    </button>
                    <button id="btn-settings-source-batch"
                        onclick="enterSourceBatchMode('settings')"
                        class="flex-shrink-0 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:hover:bg-blue-500/25 dark:text-blue-400 font-bold text-xs rounded-lg border border-blue-100 dark:border-blue-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5">
                        <i class="fas fa-tasks"></i> 批量
                    </button>
                </div>

                <!-- 批量操作工具栏 (Settings) — 在列表上方 -->
                <div id="settings-source-batch-bar"
                    class="hidden mb-3 flex flex-wrap items-center gap-2 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/25">
                    <span
                        class="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1.5">
                        <i class="fas fa-check-square"></i>
                        已选 <strong id="settings-source-batch-count">0</strong> 项
                    </span>
                    <div class="flex flex-wrap gap-1.5 ml-auto">
                        <button onclick="selectAllSourceBatch('settings')"
                            class="px-2.5 py-1 text-xs bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/20 transition-colors"><i
                                class="fas fa-check-double mr-1"></i>全选</button>
                        <button onclick="batchSourceEnable('settings', true)"
                            class="px-2.5 py-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"><i
                                class="fas fa-toggle-on mr-1"></i>批量启用</button>
                        <button onclick="batchSourceEnable('settings', false)"
                            class="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"><i
                                class="fas fa-toggle-off mr-1"></i>批量禁用</button>
                        <button onclick="batchSourceDelete('settings')"
                            class="px-2.5 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"><i
                                class="fas fa-trash-alt mr-1"></i>批量删除</button>
                        <button onclick="exitSourceBatchMode('settings')"
                            class="px-2.5 py-1 text-xs bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 t-text-muted rounded-lg transition-colors"><i
                                class="fas fa-times mr-1"></i>退出</button>
                    </div>
                </div>

                <!-- 已上传的源列表 -->
                <div id="settings-custom-sources-list" class="space-y-2">
                    <div class="text-xs t-text-muted text-center py-2">暂无数据 (JS未加载)</div>
                </div>

            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- 公开源开关 -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-bold t-text-main flex items-center">
                            <i class="fas fa-globe mr-2 text-emerald-500"></i> 启用公开源
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">开启后，您上传的自定义源将可以被其他用户在公共源列表中看到。</span>
                            </span>
                        </h4>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="toggle-public-sources" class="sr-only peer"
                                onchange="togglePublicSourcesSetting()">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>

                <!-- 默认音质 -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-music mr-2 text-emerald-500"></i> 默认音质
                        <span class="setting-tooltip-trigger ml-1">
                            <i class="fas fa-question-circle"></i>
                            <span class="setting-tooltip-content">实际播放音质取决于歌曲支持的最高音质，系统会自动降级</span>
                        </span>
                    </h4>
                    <select id="quality-select" onchange="changeQualityPreference(this.value)"
                        class="lm-select !w-full !py-2">
                        <option value="128k">标准音质</option>
                        <option value="320k">高音质</option>
                        <option value="flac" selected>无损音质</option>
                        <option value="flac24bit">24bit无损</option>
                        <option value="hires">高解析度</option>
                        <option value="atmos">空间音频</option>
                        <option value="atmos_plus">增强空间音频</option>
                        <option value="master">母带音质</option>
                    </select>
                </div>

                <!-- 每页显示数量 -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-list-ol mr-2 text-emerald-500"></i> 每页显示数量
                        <span class="setting-tooltip-trigger ml-1">
                            <i class="fas fa-question-circle"></i>
                            <span class="setting-tooltip-content">设置搜索和列表页面每页显示的记录数量</span>
                        </span>
                    </h4>
                    <select onchange="changeItemsPerPage(this.value)" id="items-per-page-select"
                        class="lm-select !w-full !py-2">
                        <option value="10">10 首/页</option>
                        <option value="20" selected>20 首/页 (默认)</option>
                        <option value="50">50 首/页</option>
                        <option value="100">100 首/页</option>
                        <option value="all">全部显示</option>
                    </select>
                </div>

                <!-- 默认入口 -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-sign-in-alt mr-2 text-emerald-500"></i> 默认入口
                        <span class="setting-tooltip-trigger ml-1">
                            <i class="fas fa-question-circle"></i>
                            <span class="setting-tooltip-content">设置页面刷新时默认显示的Tab页面</span>
                        </span>
                    </h4>
                    <select onchange="updateSetting('defaultEntry', this.value)"
                        id="setting-default-entry" class="lm-select !w-full !py-2">
                        <option value="search">搜索</option>
                        <option value="songlist">歌单</option>
                        <option value="leaderboard">排行榜</option>
                        <option value="favorites" selected>我的收藏 (默认)</option>
                        <option value="localmusic">本地音乐</option>
                    </select>
                </div>
            </div>
        </div>

        <div id="settings-section-network" data-settings-section="network">
            <h3 class="font-medium text-emerald-600 mb-4">网络设置</h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            播放音乐代理
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">通过服务器端代理解析和播放音乐，有效解决部分源的
                                    IP
                                    限制问题。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="toggle-proxy-playback" class="sr-only peer"
                            onchange="changeProxyPlayback(this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            下载音乐代理
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">通过服务器端代理执行音乐下载操作。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="toggle-proxy-download" class="sr-only peer"
                            onchange="changeProxyDownload(this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            自动代理
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">自动检测链接兼容性。若检测到跨域限制
                                    (CORS)、HTTPS 混合内容报错或链接失效，将自动启用服务器代理解析，确保播放成功。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="toggle-auto-proxy" class="sr-only peer"
                            onchange="changeAutoProxy(this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- 启用自定义代理 -->
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            自定义代理
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">开启后，当自动代理触发时，将优先使用您填写的自定义代理地址（客户端直接请求），而非服务器中转。<br>URL
                                    格式示例：<code>https://proxy.example.com/{url}</code><br>其中
                                    <code>{url}</code>
                                    将被替换为原始音乐链接（不编码）。需同时开启"自动代理"才生效。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="toggle-custom-proxy" class="sr-only peer"
                            onchange="updateSetting('enableCustomProxy', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- 自定义代理URL输入框 (动态显示) -->
                <div id="custom-proxy-url-row" class="hidden">
                    <input type="url" id="custom-proxy-url-input"
                        placeholder="https://proxy.example.com/{url}"
                        class="w-full px-3 py-2 border t-border-main rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 t-bg-main t-text-main"
                        onchange="updateSetting('customProxyUrl', this.value.trim())"
                        oninput="updateSetting('customProxyUrl', this.value.trim())">
                    <p class="text-[11px] t-text-muted mt-1.5 leading-relaxed">
                        <i class="fas fa-info-circle text-emerald-500 mr-1"></i>使用 <code
                            class="bg-gray-100 dark:bg-gray-800 px-1 rounded">{url}</code>
                        作为原始链接占位符，将被直接替换为原始音乐 URL（不编码）。
                    </p>
                </div>

                <!-- 缓存并发量设置 -->
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            缓存并发量
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">控制本地与云端同时执行的任务数量（建议
                                    3-5）。</span>
                            </span>
                        </div>
                    </div>
                    <select id="setting-download-concurrency" class="lm-select !w-20 !py-1"
                        onchange="updateSetting('downloadConcurrency', parseInt(this.value))">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3" selected>3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                    </select>
                </div>
            </div>
        </div>

        <div id="settings-section-updates" data-settings-section="updates" class="settings-form-card space-y-4">
            <h3 class="font-medium text-emerald-600 mb-4">版本更新</h3>
            <div class="space-y-4">
                <label class="flex items-center justify-between text-sm t-text-main" for="setting-app-update-enabled">检查更新（默认关闭）
                    <span class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-app-update-enabled" class="sr-only peer" />
                        <span class="settings-switch-track" aria-hidden="true"></span>
                    </span>
                </label>
                <div><label for="setting-app-update-server" class="block text-sm t-text-main mb-2">检查更新服务器地址</label>
                    <input type="url" id="setting-app-update-server" class="settings-text-input" />
                    <p class="text-xs t-text-muted mt-2">默认使用 llxserver 的 GitHub 发布；可改为 Gitea 或 GitHub 的 latest release API。</p>
                </div>
                <div><label for="setting-app-update-token" class="block text-sm t-text-main mb-2">访问令牌（可选）</label>
                    <input type="password" id="setting-app-update-token" class="settings-text-input" autocomplete="new-password" placeholder="私有仓库填写，留空保留已存令牌" />
                    <label class="block text-xs t-text-muted mt-2"><input type="checkbox" id="setting-app-update-clear-token" class="accent-emerald-500" /> 清除已保存令牌</label>
                </div>
                <button type="button" onclick="saveAppUpdateSettings()" class="settings-action">保存更新设置</button>
            </div>
        </div>

        <!-- Auto Update Settings -->
        <div id="settings-section-auto-update" data-settings-section="auto-update" class="pt-6 border-t t-border-main">
            <h3 class="font-medium text-emerald-600 mb-4">自动更新</h3>

            <div class="space-y-4">
                <!-- [New] Auto Update Network List -->
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            自动更新网络歌单
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">
                                    <b>总开关：同时控制以下两种自动更新行为</b><br><br>
                                    ①
                                    <b>服务端后台定时同步</b>：按下方设置的检测间隔，服务器自动拉取所有账号的网络歌单，发现变化时覆盖更新并在侧栏显示红点提示。<br><br>
                                    ② <b>点击歌单时自动同步</b>：进入网络歌单时，自动尝试从原始地址拉取最新内容。<br><br>
                                    注意：自动更新会覆盖本地对该歌单的修改。
                                </span>
                            </span>
                        </div>
                        <div class="text-xs t-text-muted mt-0.5">控制服务端后台定时同步 & 点击歌单时自动拉取</div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-auto-update-list" class="sr-only peer"
                            onchange="updateSetting('autoUpdateNetworkList', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                        <div class="text-sm font-bold t-text-main">
                            网络歌单自动检测间隔
                        </div>
                        <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span id="task-last-run-badge"
                                class="text-[11px] px-2 py-0.5 rounded-lg border t-border-main text-gray-500 dark:text-gray-400 font-normal bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-1">
                                <i class="fas fa-history text-[9px] text-emerald-500"></i>
                                <span id="task-last-run-text">${window.LoadingState.render('上次执行: 加载中…', 'inline')}</span>
                            </span>
                            <span id="task-next-run-badge"
                                class="text-[11px] px-2 py-0.5 rounded-lg border t-border-main text-gray-500 dark:text-gray-400 font-normal bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-1">
                                <i class="far fa-clock text-[9px] text-emerald-500"></i>
                                <span id="task-next-run-text">${window.LoadingState.render('下次执行: 加载中…', 'inline')}</span>
                            </span>
                        </div>
                        <div class="text-xs t-text-muted mt-1.5">
                            服务端后台任务：定时轮询所有账号的网络歌单，发现变化时自动更新并标红。
                        </div>
                    </div>
                    <div class="relative flex flex-col items-end gap-1.5">
                        <div class="flex items-center gap-2">
                            <input id="setting-network-list-auto-check-interval" type="hidden"
                                value="6h"
                                onchange="updateSetting('networkListAutoCheckInterval', this.value)">
                            <button type="button" id="btn-open-interval-popover"
                                onclick="toggleIntervalPopover(event)"
                                class="flex items-center gap-2 px-3.5 py-2 rounded-xl border t-border-main bg-white/60 dark:bg-gray-800/60 hover:border-emerald-500/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 text-sm font-medium transition-all shadow-sm">
                                <i class="far fa-clock text-emerald-500 text-sm"></i>
                                <span id="interval-trigger-label"
                                    class="t-text-main font-semibold tracking-wide">6小时</span>
                                <i class="fas fa-chevron-down text-xs t-text-muted ml-1 transition-transform duration-200"
                                    id="interval-chevron-icon"></i>
                            </button>
                        </div>

                        <div id="interval-popover-panel"
                            class="hidden absolute right-0 top-full mt-2 w-72 p-4 rounded-2xl shadow-2xl border t-border-main bg-white dark:bg-gray-900 z-50 animate-fade-in backdrop-blur-md">
                            <div
                                class="flex items-center justify-between pb-2.5 mb-3 border-b t-border-main">
                                <div
                                    class="text-xs font-bold t-text-main flex items-center gap-1.5">
                                    <i class="far fa-hourglass-half text-emerald-500"></i> 检测间隔设置
                                </div>
                                <span class="text-[11px] text-gray-400">最小 30秒</span>
                            </div>

                            <div class="mb-3">
                                <div class="text-[11px] font-semibold text-gray-400 mb-1.5">快捷预设
                                </div>
                                <div class="grid grid-cols-4 gap-1.5"
                                    id="interval-presets-container">
                                    <button type="button" onclick="selectIntervalPreset('30m')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">30分</button>
                                    <button type="button" onclick="selectIntervalPreset('1h')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">1小时</button>
                                    <button type="button" onclick="selectIntervalPreset('2h')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">2小时</button>
                                    <button type="button" onclick="selectIntervalPreset('6h')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">6小时</button>
                                    <button type="button" onclick="selectIntervalPreset('12h')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">12小时</button>
                                    <button type="button" onclick="selectIntervalPreset('1d')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">1天</button>
                                    <button type="button" onclick="selectIntervalPreset('3d')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">3天</button>
                                    <button type="button" onclick="selectIntervalPreset('7d')"
                                        class="interval-preset-btn px-2 py-1.5 text-xs rounded-lg border t-border-main hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all font-medium text-center">7天</button>
                                </div>
                            </div>

                            <div class="mb-3 pt-2.5 border-t t-border-main">
                                <div
                                    class="flex items-center justify-between text-[11px] font-semibold text-gray-400 mb-2">
                                    <span>自定义复合时长</span>
                                    <span
                                        class="text-[10px] text-gray-400 font-normal">支持组合天/时/分</span>
                                </div>
                                <div class="grid grid-cols-3 gap-2">
                                    <!-- 天 -->
                                    <div class="flex flex-col items-center">
                                        <div class="text-[10px] text-gray-400 mb-1 font-medium">天
                                        </div>
                                        <div
                                            class="flex items-center w-full border t-border-main rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800/50">
                                            <button type="button"
                                                onclick="stepCompoundInterval('d', -1)"
                                                class="w-6 py-1.5 text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-[10px] flex items-center justify-center">
                                                <i class="fas fa-minus"></i>
                                            </button>
                                            <input type="number" id="compound-interval-days" min="0"
                                                max="365" value="0"
                                                oninput="onCompoundIntervalInput('d')"
                                                onchange="onCompoundIntervalChange('d')"
                                                onblur="onCompoundIntervalChange('d')"
                                                class="w-full text-center bg-transparent text-xs font-bold t-text-main focus:outline-none py-1">
                                            <button type="button"
                                                onclick="stepCompoundInterval('d', 1)"
                                                class="w-6 py-1.5 text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-[10px] flex items-center justify-center">
                                                <i class="fas fa-plus"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- 小时 -->
                                    <div class="flex flex-col items-center">
                                        <div class="text-[10px] text-gray-400 mb-1 font-medium">小时
                                        </div>
                                        <div
                                            class="flex items-center w-full border t-border-main rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800/50">
                                            <button type="button"
                                                onclick="stepCompoundInterval('h', -1)"
                                                class="w-6 py-1.5 text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-[10px] flex items-center justify-center">
                                                <i class="fas fa-minus"></i>
                                            </button>
                                            <input type="number" id="compound-interval-hours"
                                                min="0" max="23" value="6"
                                                oninput="onCompoundIntervalInput('h')"
                                                onchange="onCompoundIntervalChange('h')"
                                                onblur="onCompoundIntervalChange('h')"
                                                class="w-full text-center bg-transparent text-xs font-bold t-text-main focus:outline-none py-1">
                                            <button type="button"
                                                onclick="stepCompoundInterval('h', 1)"
                                                class="w-6 py-1.5 text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-[10px] flex items-center justify-center">
                                                <i class="fas fa-plus"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- 分钟 -->
                                    <div class="flex flex-col items-center">
                                        <div class="text-[10px] text-gray-400 mb-1 font-medium">分钟
                                        </div>
                                        <div
                                            class="flex items-center w-full border t-border-main rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800/50">
                                            <button type="button"
                                                onclick="stepCompoundInterval('m', -1)"
                                                class="w-6 py-1.5 text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-[10px] flex items-center justify-center">
                                                <i class="fas fa-minus"></i>
                                            </button>
                                            <input type="number" id="compound-interval-minutes"
                                                min="0" max="59" value="0"
                                                oninput="onCompoundIntervalInput('m')"
                                                onchange="onCompoundIntervalChange('m')"
                                                onblur="onCompoundIntervalChange('m')"
                                                class="w-full text-center bg-transparent text-xs font-bold t-text-main focus:outline-none py-1">
                                            <button type="button"
                                                onclick="stepCompoundInterval('m', 1)"
                                                class="w-6 py-1.5 text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-[10px] flex items-center justify-center">
                                                <i class="fas fa-plus"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="flex items-center justify-between gap-2 pt-2.5 border-t t-border-main">
                                <div class="text-[11px] text-gray-400">
                                    预览: <span id="interval-preview-text"
                                        class="font-semibold text-emerald-500">6 小时</span>
                                </div>
                                <div class="flex gap-1.5">
                                    <button type="button" onclick="closeIntervalPopover()"
                                        class="px-3 py-1 text-xs rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                                        取消
                                    </button>
                                    <button type="button" onclick="applyIntervalPicker()"
                                        class="px-3.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all active:scale-95">
                                        确定
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main">检查所有歌单更新</div>
                        <div class="text-xs t-text-muted mt-1">手动触发一次网络歌单更新检测，结果会在侧边栏中显示。</div>
                    </div>
                    <button type="button" onclick="checkNetworkListUpdates(true)"
                        class="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-all">
                        立即检查
                    </button>
                </div>

                <!-- [Renamed] Save Settings to Server Toggle -->
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            自动同步账号设置到文件
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">保存当前账号的设置（音质、源选择等）到服务器端用户配置目录，实现多端自动同步。注意：未登录状态下，该设置无效，账号设置将保存在浏览器缓存。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-save-settings-to-file"
                            class="sr-only peer"
                            onchange="updateSetting('saveAccountSettingsToFile', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- [Manual Save Settings Button] -->
                <div class="pt-4 mt-4 border-t t-border-main">
                    <button onclick="manualSaveSettings(this)"
                        class="w-full py-2.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 rounded-xl text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 shadow-sm">
                        <i class="fas fa-save"></i> 立即保存所有配置到服务器
                    </button>
                    <p class="text-[10px] t-text-muted mt-2 text-center opacity-70">手动将当前所有
                        UI
                        设置（包含音质、音效等）缓存并保存至服务器对应用户的对应json文件中。</p>
                </div>
            </div>
        </div>

        <!-- Cache & Reset -->
        <div id="settings-section-cache" data-settings-section="cache" class="pt-6 border-t t-border-main mb-2">
            <h3 class="font-medium text-emerald-600 mb-3">本地缓存与重置</h3>
            <div class="t-bg-main p-4 rounded-xl border t-border-main flex flex-col gap-3">

                <!-- Cache Toggles -->
                <div class="flex items-center justify-between pb-3 border-b t-border-main">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            缓存歌词
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">开启后，应用会自动缓存已加载的歌词。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-enable-lyric-cache" class="sr-only peer"
                            onchange="updateSetting('enableLyricCache', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <div class="flex items-center justify-between pb-3 border-b t-border-main">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            缓存歌曲链接
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">优先使用缓存链接播放，失效时系统会自动尝试重新获取并更新缓存。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-enable-url-cache" class="sr-only peer"
                            onchange="updateSetting('enableSongUrlCache', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- Server Cache Settings -->
                <div class="flex items-center justify-between pb-3 border-b t-border-main">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            缓存歌曲文件
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">将歌曲文件永久缓存到服务器存储。再次播放时无需消耗外部流量，极大提升加载速度。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-enable-server-cache" class="sr-only peer"
                            onchange="updateSetting('enableServerCache', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- Server Lyric Cache Setting -->
                <div class="flex items-center justify-between pb-3 border-b t-border-main">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            缓存歌词文件
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">将歌词文件缓存到同服务器配置的缓存目录下，优先供多端同步极速加载。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-enable-server-lyric-cache"
                            class="sr-only peer"
                            onchange="updateSetting('enableServerLyricCache', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- Embed Lyric to File Setting -->
                <div class="flex items-center justify-between pb-3 border-b t-border-main">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            下载时嵌入歌词
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">开启后，下载或缓存歌曲时将自动获取歌词并写入音频文件标签（USLT），同时保存
                                    .lrc 文件。支持浏览器下载与服务器缓存两种模式。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-embed-lyric-to-file" class="sr-only peer"
                            onchange="updateSetting('embedLyricToFile', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- Prefer Cached Playback Settings -->
                <div class="flex items-center justify-between pb-3 border-b t-border-main">
                    <div>
                        <div class="text-sm font-bold t-text-main flex items-center">
                            优先播放缓存歌曲
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">如果歌曲已缓存，则优先从本地加载。即使“缓存歌曲文件”关闭，已存在的缓存仍可使用。</span>
                            </span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-prefer-server-cache" class="sr-only peer"
                            onchange="updateSetting('preferServerCache', this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>

                <!-- Remaster Feature -->
                <div class="pb-3 border-b t-border-main space-y-3">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-bold t-text-main flex items-center">
                                启用歌曲洗版
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span
                                        class="setting-tooltip-content">将下载目录内已有歌曲替换为指定音质。该功能不处理缓存目录。</span>
                                </span>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-enable-remaster" class="sr-only peer"
                                onchange="toggleRemasterFeature(this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500 transition-all">
                            </div>
                        </label>
                    </div>
                    <div
                        class="text-xs leading-relaxed text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 rounded-lg">
                        <div class="font-bold flex items-center gap-2 mb-1">
                            <i class="fas fa-exclamation-triangle"></i>
                            风险提示
                        </div>
                        <p>洗版会替换下载目录中的原音频文件，请先备份重要文件。缓存目录不会参与处理；新文件下载或写入失败时会保留原文件。目标音质不可用时可能降级，结果中会标明实际音质。
                        </p>
                    </div>
                </div>

                <!-- Cache Location Setting -->
                <div class="pb-3 border-b t-border-main">
                    <div class="flex items-center justify-between mb-2">
                        <div>
                            <div class="text-sm font-bold t-text-main flex items-center">
                                缓存歌曲位置
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">设置服务器端存储缓存文件的具体路径。</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <select id="setting-server-cache-location"
                        onchange="selectServerCacheLocation(this.value)"
                        class="lm-select !w-full !py-2.5">
                        <option value="data">服务器数据路径</option>
                        <option value="root">运行目录 (仅本地)</option>
                        <option value="custom">自定义目录（输入绝对路径）</option>
                    </select>

                    <div class="mt-4 mb-2 flex items-center justify-between">
                        <div class="text-sm font-bold t-text-main flex items-center">
                            歌曲命名方式
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">设置服务端存储文件的命名规则（用于播放缓存）。不影响已有文件。</span>
                            </span>
                        </div>
                    </div>
                    <select id="setting-server-cache-naming"
                        onchange="updateSetting('serverCacheNamingPattern', this.value); updateServerCacheConfig(null, this.value)"
                        class="lm-select !w-full !py-2.5">
                        <option value="standard">标准 (Name_-_Singer_-_Source_-_ID_-_Quality)
                        </option>
                        <option value="simple">简洁 (Name - Singer - Quality - Album)</option>
                        <option value="singer_name_quality_album">歌手-歌名-音质-专辑 (Singer - Name -
                            Quality - Album)</option>
                        <option value="singer_name">歌手-歌名 (Singer - Name)</option>
                        <option value="name_singer">歌名-歌手 (Name - Singer)</option>
                    </select>

                    <div class="mt-4 pt-3 border-t t-border-main flex items-center justify-between">
                        <div>
                            <div class="text-sm font-bold t-text-main flex items-center">
                                查看当前存储目录
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span
                                        class="setting-tooltip-content">根据「缓存歌曲位置」显示当前播放缓存的绝对路径。</span>
                                </span>
                            </div>
                            <div class="text-xs t-text-muted mt-0.5">查看当前账号播放缓存目录的绝对路径</div>
                        </div>
                        <button type="button" onclick="showServerDirectories()"
                            class="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm hover:shadow transition-all active:scale-95 flex items-center gap-1.5 shrink-0">
                            <i class="fas fa-folder-open text-xs"></i>
                            <span>查看目录</span>
                        </button>
                    </div>
                </div>

                <div
                    class="text-xs text-gray-500 italic mt-1 mb-2 p-2 bg-yellow-50 rounded border border-yellow-100 flex items-start gap-1">
                    <i class="fas fa-info-circle mt-0.5 text-yellow-600"></i>
                    <span>优先级: 本地文件 > 链接缓存 > 在线获取 (自动缓存)</span>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold t-text-main flex items-center">
                            浏览器存储占用
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">当前浏览器 localStorage 及 IndexedDB
                                    (歌单数据)
                                    已使用空间。</span>
                            </span>
                        </span>
                    </div>
                    <span id="storage-usage-info"
                        class="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">0
                        KB</span>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold t-text-main flex items-center">
                            服务器缓存占用
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span
                                    class="setting-tooltip-content">已缓存在服务器端的歌曲文件和歌词文件总占用空间。</span>
                            </span>
                        </span>
                    </div>
                    <div class="flex flex-col gap-1 text-right">
                        <div id="server-music-info" title="历史音乐目录 (/music)"
                            class="text-[10px] md:text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                            正在统计音乐...</div>
                        <div id="server-cache-info" title="标准缓存目录 (/cache)"
                            class="text-[10px] md:text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            正在统计缓存...</div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="clearCache('lyric')"
                        class="py-2 px-3 t-bg-panel border t-border-main t-text-muted hover:text-emerald-600 hover:border-emerald-200 rounded-lg text-xs font-bold transition-colors">
                        <i class="fas fa-trash-alt mr-1"></i> 清除歌词缓存
                    </button>
                    <button onclick="clearCache('url')"
                        class="py-2 px-3 t-bg-panel border t-border-main t-text-muted hover:text-emerald-600 hover:border-emerald-200 rounded-lg text-xs font-bold transition-colors">
                        <i class="fas fa-link mr-1"></i> 清除链接缓存
                    </button>
                    <button onclick="updateServerCacheSize()"
                        class="py-2 px-3 t-bg-panel border t-border-main t-text-muted hover:text-blue-600 hover:border-blue-200 rounded-lg text-xs font-bold transition-colors">
                        <i class="fas fa-sync-alt mr-1"></i> 刷新缓存统计
                    </button>
                    <button onclick="toggleCacheDrawer()"
                        class="py-2 px-3 t-bg-panel border t-border-main t-text-muted hover:text-blue-600 hover:border-blue-200 rounded-lg text-xs font-bold transition-colors">
                        <i class="fas fa-server mr-1"></i> 管理服务器缓存
                    </button>
                </div>

                <button onclick="resetAllSettings()"
                    class="w-full py-2.5 px-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white font-bold rounded-lg transition-all duration-300 border border-red-100 flex items-center justify-center gap-3 text-center mt-1">
                    <i class="fas fa-undo-alt flex-shrink-0"></i>
                    <span class="leading-tight">重置所有设置</span>
                </button>

            </div>
        </div>
    </div>

    <!-- Display Settings Panel -->
    <div id="settings-panel-account" class="hidden space-y-6">
        <div id="settings-section-account" data-settings-section="account" class="pt-2 space-y-6">
            <div class="settings-form-card account-settings-card">
                <div class="account-card-heading"><h3>账号资料</h3><p>管理头像和展示名称</p></div>
                <form id="account-profile-form" onsubmit="saveAccountProfile(event)">
                    <div class="account-fields-grid">
                        <div class="account-avatar-field"><span id="account-avatar-preview" class="header-avatar"><i class="fas fa-user"></i></span><label class="settings-action settings-action-secondary cursor-pointer">上传头像<input id="account-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange="uploadAccountAvatar(this)"></label><p class="account-field-hint">PNG、JPEG、WebP、GIF，最大 2 MB</p></div>
                        <label class="settings-field">登录名<input type="text" id="account-username" disabled readonly aria-readonly="true" title="登录名不可修改" class="settings-text-input"><small class="account-field-hint">登录账号的唯一标识，不可修改</small></label>
                        <label class="settings-field">用户名<input type="text" id="account-nickname" maxlength="40" class="settings-text-input"><small class="account-field-hint">最多 40 字，留空时使用登录名</small></label>
                    </div>
                    <div class="account-form-actions"><button type="submit" class="settings-action"><i class="fas fa-save"></i>保存用户名</button><p id="account-profile-status" role="status" aria-live="polite"></p></div>
                </form>
            </div>
            <div id="account-password-section" class="settings-form-card account-settings-card">
                <div class="account-card-heading"><h3>账号安全</h3><p>更新登录密码，修改后需重新登录</p></div>
                <form id="account-password-form" onsubmit="changeAccountPassword(event)">
                    <div class="account-fields-grid">
                        <label class="settings-field">原密码<input type="password" id="account-current-password" autocomplete="current-password" required class="settings-text-input"></label>
                        <label class="settings-field">新密码<input type="password" id="account-new-password" autocomplete="new-password" required minlength="6" maxlength="128" class="settings-text-input"><small class="account-field-hint">6–128 位字符</small></label>
                        <label class="settings-field">确认新密码<input type="password" id="account-confirm-password" autocomplete="new-password" required minlength="6" maxlength="128" class="settings-text-input"></label>
                    </div>
                    <div class="account-form-actions"><button type="submit" class="settings-action"><i class="fas fa-key"></i>修改密码</button><p id="account-password-status" role="status" aria-live="polite"></p></div>
                </form>
            </div>
        </div>
        <div id="settings-section-configuration-import" data-settings-section="configuration-import" class="settings-form-card space-y-4">
            <div class="space-y-3 mb-4">
                <div class="text-sm font-bold t-text-main">迁移洛雪配置</div>
                <p class="text-xs t-text-muted">上传 JSON，将文件中提供的设置、歌单、音效和媒体库覆盖到当前账号。未提供的部分保持原值。</p>
                <input id="configuration-import-file" type="file" accept=".json,application/json" class="hidden" onchange="importLxConfiguration(this)">
                <button id="configuration-import-button" type="button" class="settings-action" onclick="selectLxConfiguration()"><i class="fas fa-file-import"></i>上传 JSON 并迁移</button>
                <p id="configuration-import-status" class="text-xs t-text-muted" role="status" aria-live="polite"></p>
            </div>

        </div>
        <div id="settings-section-token" data-settings-section="token" class="settings-form-card">
            <!-- 当前账号的 API 访问凭证 -->
            <div id="token-management-section"
                class="space-y-4 animate-fade-in">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex flex-col">
                        <h4 class="text-sm font-bold t-text-main flex items-center gap-2">
                            <i class="fas fa-key text-emerald-500"></i> 启用 Token 认证
                        </h4>
                        <span class="text-[10px] t-text-muted mt-0.5">API 访问凭证管理</span>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="setting-enable-persistent-token" aria-label="启用 Token 认证"
                            class="sr-only peer" onchange="toggleTokenAuthSetting(this.checked)">
                        <div
                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                        </div>
                    </label>
                </div>
                <div id="token-list-container"
                    class="space-y-4 opacity-50 pointer-events-none transition-all duration-300">
                    <div id="token-items" class="space-y-2 max-h-60 overflow-y-auto hide-scrollbar">
                        <!-- Token 列表由 JS 注入 -->
                    </div>
                    <button onclick="openAddTokenModal()"
                        class="w-full py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2">
                        <i class="fas fa-plus"></i> 生成新验证 Token
                    </button>
                </div>
            </div>
        </div>

    </div>
    <div id="settings-panel-display" class="hidden space-y-8 animate-fade-in">
<div id="settings-section-theme" data-settings-section="theme" class="settings-theme-panel settings-form-card hidden">
        <div data-theme-controls></div>
        <div class="theme-editor"><h3>自定义主题风格</h3><p>选择喜欢的颜色，立即应用到整个客户端。</p>
            <label>自定义颜色<input type="color" data-experience-control="color" aria-label="自定义主题颜色"></label>
            <label>面板透明度<input type="range" min="0" max="1" step="0.01" data-experience-control="opacity" aria-label="面板透明度"><output></output></label>
            <p>0% 为不透明，100% 仅保留边框。统一调整各页面、左侧菜单与底部播放栏。</p>
            <label>毛玻璃模糊度<input type="range" min="0" max="100" step="1" data-experience-control="glassBlur" aria-label="毛玻璃模糊度"><output></output></label>
            <p>0% 不模糊。播放详情使用独立的背景效果。</p>
        </div>
        <div class="theme-editor"><h3>图片背景</h3><p>上传图片后拖动预览调整位置。图片保存在当前配置的缓存目录，图片丢失时自动回退默认主题。</p>
            <div class="theme-image-actions"><label for="theme-image-upload"><i class="fas fa-upload"></i> 上传图片</label><input id="theme-image-upload" class="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><button onclick="MusicExperience.change({background:null})">移除背景</button></div>
            <div id="theme-background-preview" class="theme-background-preview"><span>上传图片后可拖动调整位置</span></div>
            <label>水平位置<input type="range" min="0" max="100" data-experience-control="x" aria-label="背景水平位置"><output></output></label>
            <label>垂直位置<input type="range" min="0" max="100" data-experience-control="y" aria-label="背景垂直位置"><output></output></label>
            <label>模糊度<input type="range" min="0" max="40" data-experience-control="blur" aria-label="背景模糊度"><output></output></label>
            <p>支持 PNG、JPEG、WebP、GIF，最大 10 MB。</p>
        </div>
    </div>
        <!-- 界面与布局 -->
        <div id="settings-section-layout" data-settings-section="layout" class="col-span-full border-t t-border-main pt-6 mt-4 space-y-4">
            <h4 class="text-sm font-bold t-text-main flex items-center">
                <i class="fas fa-desktop mr-2 text-emerald-500"></i> 界面与布局
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Auto Compact Playbar Toggle -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold t-text-main flex items-center">
                                自动精简控制栏
                                <span class="setting-tooltip-trigger ml-1">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">
                                        (仅手机版) 进入歌词界面自动精简播放栏，关闭界面时自动恢复展开。<br>
                                        <span class="text-emerald-500 font-medium">*
                                            提示：长按播放键可手动切换。</span>
                                    </span>
                                </span>
                            </h4>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-auto-compact-playbar"
                                class="sr-only peer"
                                onchange="updateSetting('autoCompactPlaybar', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Sidebar Info Toggle -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold t-text-main flex items-center">
                                展示侧边栏封面/标题
                                <span class="setting-tooltip-trigger">
                                    <i class="fas fa-question-circle"></i>
                                    <span class="setting-tooltip-content">
                                        是否在屏幕左下角展示当前播放歌曲的封面和名称 (仅在电脑版生效)。屏幕太窄时自动隐藏。
                                    </span>
                                </span>
                            </h4>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-show-sidebar-info"
                                class="sr-only peer"
                                onchange="updateSetting('showSidebarSongInfo', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Hot Search Limit -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow col-span-full">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-bold t-text-main flex items-center mb-0">
                            <i class="fas fa-list-ol mr-2 text-emerald-500"></i> 热搜显示数量
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">
                                    设置搜索页面显示的热门搜索词数量 (0-50，设置为0关闭显示)<br>
                                    <span class="text-emerald-500 font-medium">*
                                        实际数量取决于源，可能少于设置值</span>
                                </span>
                            </span>
                        </h4>
                        <div class="w-24">
                            <input type="number" id="hot-search-limit-input"
                                class="w-full px-3 py-1.5 border t-border-main rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                                value="20" min="0" max="50"
                                onchange="changeHotSearchLimit(this.value)">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 播放背景与视觉特效 -->
        <div id="settings-section-visuals" data-settings-section="visuals" class="col-span-full border-t t-border-main pt-6 mt-4 space-y-4">
            <h4 class="text-sm font-bold t-text-main flex items-center">
                <i class="fas fa-image mr-2 text-emerald-500"></i> 播放背景与视觉特效
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Player Background Style -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-bold t-text-main flex items-center">
                            <i class="fas fa-image mr-2 text-emerald-500"></i> 歌曲播放页背景
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">设置歌曲播放详情页背景的显示风格</span>
                            </span>
                        </h4>
                    </div>
                    <select id="setting-player-background"
                        onchange="updateSetting('playerBackground', this.value)"
                        class="lm-select !w-full !py-2">
                        <option value="theme">跟随页面（透明背景）</option>
                        <option value="artist">歌手氛围</option>
                        <option value="blur">封面虚化</option>
                        <option value="solid">纯色背景</option>
                        <option value="dark">黑色背景</option>
                    </select>
                </div>

                <!-- Detail Visualizer -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-bold t-text-main flex items-center">
                            <i class="fas fa-film mr-2 text-emerald-500"></i> 详情页视觉特效
                            <span class="setting-tooltip-trigger ml-1">
                                <i class="fas fa-question-circle"></i>
                                <span class="setting-tooltip-content">歌词详情页（全屏模式）下的背景视觉特效。</span>
                            </span>
                        </h4>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="setting-show-detail-visualizer"
                                class="sr-only peer"
                                onchange="updateSetting('showDetailVisualizer', this.checked)">
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                            </div>
                        </label>
                    </div>
                    <div id="setting-detail-visualizer-options" hidden>
                        <select id="setting-detail-visualizer-style"
                            onchange="updateSetting('detailVisualizerStyle', this.value)"
                            class="lm-select !w-full !py-2">
                            <option value="spectrum">底部频谱</option>
                            <option value="pulse">频率脉冲</option>
                            <option value="dots">点阵频谱</option>
                            <option value="flower">灵动莲花</option>
                        </select>
                    </div>
                </div>

                <!-- Global Style (Blocks vs Connected) -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-shapes mr-2 text-emerald-500"></i> 渲染风格
                        <span class="setting-tooltip-trigger ml-1">
                            <i class="fas fa-question-circle text-[10px]"></i>
                            <span class="setting-tooltip-content">
                                设置全局视觉特效的渲染方式。<br>
                                <span class="text-emerald-500 font-medium">※
                                    此风格主要影响条形阵列和频率脉冲效果。</span>
                            </span>
                        </span>
                    </h4>
                    <select id="setting-visualizer-global-style"
                        onchange="updateSetting('visualizerGlobalStyle', this.value)"
                        class="lm-select !w-full !py-2">
                        <option value="blocks">方块样式</option>
                        <option value="connected">连体样式</option>
                    </select>
                </div>

                <!-- Global Opacity -->
                <div
                    class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow col-span-full">
                    <div
                        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                        <h4 class="text-sm font-bold t-text-main flex items-center mb-0 shrink-0">
                            <i class="fas fa-adjust mr-2 text-emerald-500"></i> 全局透明度
                        </h4>
                        <div class="flex items-center gap-3 flex-1">
                            <input type="range" id="setting-visualizer-opacity"
                                class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                min="0.1" max="1.0" step="0.1" value="0.5"
                                oninput="updateSetting('visualizerOpacity', parseFloat(this.value))">
                            <span id="visualizer-opacity-value"
                                class="text-sm font-mono text-emerald-600 font-bold w-10 text-right">0.5</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Mobile bottom spacer -->
        <div class="pb-36 md:pb-4"></div>
    </div>

    <!-- Logic Settings Panel -->
    <div id="settings-panel-logic" class="hidden space-y-6 animate-fade-in">
        <div>
            <h3 class="font-bold t-text-main text-lg mb-4 flex items-center">
                <i class="fas fa-microchip mr-2 text-emerald-500"></i> 播放逻辑
            </h3>
            <div class="space-y-4">
                <!-- 播放队列与列表 -->
                <div id="settings-section-queue" data-settings-section="queue" class="col-span-full pt-2 space-y-4">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-list-ul mr-2 text-emerald-500"></i> 播放队列与列表
                    </h4>
                    <div class="t-bg-panel rounded-xl border t-border-main p-4">
                        <label for="setting-queue-opacity" class="playback-experience-label">播放队列背景不透明度<output id="setting-queue-opacity-value">95%</output></label>
                        <input id="setting-queue-opacity" type="range" min="0" max="1" step="0.01" value="0.95"
                            class="playback-experience-slider" oninput="window.playbackExperience.syncOpacity(this.value)" onchange="updateSetting('queueOpacity', this.value)">
                        <p class="playback-experience-help">值越大越清晰，独立于全局毛玻璃；队列顶部也可以调整。</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Change Playlist on Search Play -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        播放搜索歌曲时切换歌单
                                        <span class="setting-tooltip-trigger">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                开启：播放搜索出的歌曲后，播放列表切换为搜索结果。<br>
                                                关闭：播放搜索出的歌曲后，播放列表切换为默认列表。<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    提示：所有搜索到的歌曲播放时都会自动加入默认列表</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-switch-playlist-search"
                                        class="sr-only peer"
                                        onchange="updateSetting('switchPlaylistOnSearchPlay', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Deduplicate Playlist by Quality -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        本地列表播放去重
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                当播放本地音乐（列表）时，若存在同 ID
                                                但音质不同的歌曲文件，仅保留最高音质版本。说明有相同id歌曲，只播放最高音质歌曲。
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-deduplicate-playlist"
                                        class="sr-only peer"
                                        onchange="updateSetting('deduplicatePlaylistByQuality', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Change Playlist on Song List Play -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        播放歌单/排行榜歌曲时切换歌单
                                        <span class="setting-tooltip-trigger">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                开启：播放歌单或排行榜中的单个歌曲后，播放列表切换为对应列表。<br>
                                                关闭：播放歌单或排行榜中的单个歌曲后，保持当前播放队列不变。<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    提示：所有歌单/排行榜歌曲播放时会自动加入默认列表</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-switch-playlist-songlist"
                                        class="sr-only peer"
                                        onchange="updateSetting('switchPlaylistOnSongListPlay', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        播放时自动剔除不喜欢歌曲
                                        <span class="setting-tooltip-trigger">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                开启：在播放搜索列表、歌单、排行榜并替换播放队列时，自动从列表中剔除被标记为“不喜欢”的歌曲（主动点击播放的和主动播放不喜欢的除外）。<br>
                                                关闭：不剔除不喜欢歌曲。
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-auto-filter-disliked"
                                        class="sr-only peer"
                                        onchange="updateSetting('autoFilterDislikedSongs', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 播放体验强化 -->
                <div id="settings-section-playback" data-settings-section="playback" class="col-span-full border-t t-border-main pt-6 mt-4 space-y-4">
<div class="theme-editor settings-form-card"><h3>最近播放</h3><label>最大保存记录<input type="number" min="1" max="10000" step="1" data-experience-control="recentLimit" aria-label="最近播放最大保存记录"></label><p>默认保留 100 条。减小上限后会立即裁剪当前账号的记录。</p></div>
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-headphones-alt mr-2 text-emerald-500"></i> 播放体验强化
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Pre-fetching Setting -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        音乐预读机制
                                        <span class="setting-tooltip-trigger">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                开启：在一首歌曲开始播放时，系统将自动在后台预解析并读取下一首歌曲的播放内容。预读过程中会自动跳过无法播放的歌曲。<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    极大提升移动端后台播放的连续性，但可能会产生少量额外流量。</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-enable-preloader"
                                        class="sr-only peer"
                                        onchange="updateSetting('enablePreloader', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Auto Resume -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        自动恢复进度
                                        <span class="setting-tooltip-trigger">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                自动恢复最后播放的歌曲、进度及列表。会自动跳转到上次对应的歌单选项卡。
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-auto-resume"
                                        class="sr-only peer"
                                        onchange="updateSetting('autoResume', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        音频淡入淡出
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span
                                                class="setting-tooltip-content">切歌、暂停和恢复播放时平滑改变音量；下方时长分别应用于每次淡入和淡出。</span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-enable-crossfade"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableCrossfade', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                            <div class="mt-4">
                                <label for="setting-crossfade-duration" class="playback-experience-label">淡入淡出时间<output id="crossfade-duration-value">1 秒</output></label>
                                <input id="setting-crossfade-duration" type="range" min="100" max="15000" step="100" value="1000"
                                    class="playback-experience-slider" oninput="window.playbackExperience.syncDuration(this.value)" onchange="updateSetting('crossfadeDuration', this.value)">
                                <p class="playback-experience-help">0.1–15 秒；淡出完成后切换，淡入使用相同时长。</p>
                            </div>
                        </div>

                        <!-- Keep Screen Awake -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        保持屏幕常亮
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span
                                                class="setting-tooltip-content">防止由于系统自动息屏导致的播放中断，兼容绝大多数移动端设备。</span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-keep-screen-awake"
                                        class="sr-only peer"
                                        onchange="updateSetting('keepScreenAwake', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Playback Failure Strategy Section -->
                <div id="settings-section-recovery" data-settings-section="recovery" class="col-span-full border-t t-border-main pt-6 mt-4 space-y-4">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-shield-alt mr-2 text-emerald-500"></i> 播放失败处理策略
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Auto Degrade Quality -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4
                                        class="text-sm font-bold t-text-main flex items-center animate-fade-in">
                                        自动尝试降低音质
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                开启：当前音质解析失败，自动尝试查找并解析较低音质的版本。<br>
                                                关闭：不尝试降级音质。
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-auto-degrade-quality"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableAutoDegradeQuality', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Auto Switch Source -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        自动切换平台
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                根据“歌名+歌手+时长”在全网精准匹配同名歌曲尝试播放。<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    开启：自动搜索其他平台备选源 |
                                                    关闭：当前平台源失效即报错</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-auto-switch-source"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableAutoSwitchSource', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Auto Switch API Parser Source -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        自动尝试换源
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                解析或播放音频时，若首个自定义源解析报错或返回的链接无法播放（如失效/防盗链403），系统会自动排除该故障源，无缝切换尝试支持该平台的其他备选自定义源。<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    开启：自动穷尽支持该平台的所有备选源脚本 |
                                                    关闭：首个源失效或播放报错即终止该平台</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-auto-switch-api-source"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableAutoSwitchApiSource', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Auto Skip on Error -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        失败自动下一首
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                当前歌曲播放失败后自动播放下一曲。<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    开启：自动尝试下一首 |
                                                    关闭：暂停播放</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-auto-skip-on-error"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableAutoSkipOnError', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Failure Strategy Priority -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow col-span-full">
                            <div
                                class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                                <div class="shrink-0">
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        播放失败策略优先级
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                当歌曲在原平台的所有可用自定义源均已尝试且确认无法播放后，客户端依次尝试容错恢复的顺序（关闭的策略会被自动跳过）：<br>
                                                <span class="text-emerald-500 font-medium">*
                                                    跨平台换源 ->
                                                    降低音质：原平台所有音源均无法播放时，优先在全网其他平台（网易/QQ/酷我/酷狗/咪咕等）搜索同名歌曲并切换播放；若在新平台仍无法播放，再在新平台执行音质降级。<br>
                                                    降低音质 -> 跨平台换源：优先尝试降低原平台的音质（如无损 -> 320k ->
                                                    128k，新音质下会重新探测同平台可用音源）；原平台所有音质均无法解析时，再跨平台全网搜索备选源。</span><br>
                                                <span
                                                    class="text-gray-400 text-xs">注：原平台内多个自定义源脚本的自动剔错与替补，由上方的「自动尝试换源」优先自动执行。</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <div class="relative w-full sm:w-64 shrink-0">
                                    <select id="setting-playback-error-priority"
                                        onchange="updateSetting('playbackErrorPriority', this.value)"
                                        class="lm-select !w-full !py-1.5">
                                        <option value="platform,quality,next">跨平台换源 -> 降低音质 -> 下一首
                                        </option>
                                        <option value="quality,platform,next">降低音质 -> 跨平台换源 -> 下一首
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 系统交互与外设 -->
                <div id="settings-section-devices" data-settings-section="devices" class="col-span-full border-t t-border-main pt-6 mt-4 space-y-4">
                    <h4 class="text-sm font-bold t-text-main flex items-center">
                        <i class="fas fa-desktop mr-2 text-emerald-500"></i> 系统交互与外设
                    </h4>
                    <div class="space-y-4">
                        <!-- SMTC Lyric Display -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        SMTC 歌词显示
                                        <span class="setting-tooltip-trigger">
                                            <i class="fas fa-question-circle"></i>
                                            <span class="setting-tooltip-content">
                                                将当前播放的歌词行实时写入系统媒体控制 (SMTC/MediaSession) 的标题字段，使
                                                Windows
                                                任务栏、系统通知中心等能同步显示当前歌词。<br>
                                                <span class="text-emerald-500 font-medium">* 原理：利用
                                                    Web Media
                                                    Session API 高频更新
                                                    <code>metadata.title</code>
                                                    为当前歌词行，标题会随歌词进度自动滚动。<br>
                                                    关闭后恢复显示原始歌曲名称。</span>
                                            </span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-enable-smtc-lyric"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableSmtcLyric', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Keyboard Shortcuts -->
                        <div
                            class="t-bg-panel rounded-xl border t-border-main p-4 hover:shadow-sm transition-shadow">
                            <div class="flex items-center justify-between mb-4">
                                <div>
                                    <h4 class="text-sm font-bold t-text-main flex items-center">
                                        按键快捷方式
                                        <span class="setting-tooltip-trigger ml-1">
                                            <i class="fas fa-question-circle"></i>
                                            <span
                                                class="setting-tooltip-content">启用后可使用键盘快捷键控制音乐播放（仅电脑版）。</span>
                                        </span>
                                    </h4>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="setting-enable-shortcuts"
                                        class="sr-only peer"
                                        onchange="updateSetting('enableKeyboardShortcuts', this.checked)">
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 transition-all">
                                    </div>
                                </label>
                            </div>
                            <div
                                class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[10px] t-text-muted border-t t-border-main pt-3">
                                <div class="flex justify-between items-center"><span>播放/暂停</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">Space</span>
                                </div>
                                <div class="flex justify-between items-center"><span>上一曲/下一曲</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">[
                                        / ]</span>
                                </div>
                                <div class="flex justify-between items-center"><span>音量加/减</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">↑
                                        / ↓</span>
                                </div>
                                <div class="flex justify-between items-center"><span>快进/后退</span>
                                    <div class="flex flex-col items-end"><span
                                            class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">→
                                            / ←</span><span
                                            class="text-[8px] text-emerald-500/60 mt-0.5">Hold
                                            for smooth seek</span></div>
                                </div>
                                <div class="flex justify-between items-center"><span>切换页签</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">Alt
                                        + 1-6</span>
                                </div>
                                <div class="flex justify-between items-center"><span>歌词页开关</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">L</span>
                                </div>
                                <div class="flex justify-between items-center"><span>显示底部波形</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">F</span>
                                </div>
                                <div class="flex justify-between items-center"><span>显示详情波形</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">G</span>
                                </div>
                                <div class="flex justify-between items-center"><span>服务器缓存</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">H</span>
                                </div>
                                <div class="flex justify-between items-center"><span>下载管理</span>
                                    <span
                                        class="t-bg-track px-2 py-0.5 rounded-md font-mono border t-border-main">J</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Mobile bottom spacer -->
        <div class="pb-36 md:pb-4"></div>
    </div>


    <div id="settings-panel-app" class="hidden space-y-6">
        <div id="settings-section-admin" data-settings-section="admin" class="settings-form-card hidden">
            <p class="t-text-muted mb-4">进入后台管理，管理用户、系统配置、数据同步和服务器文件。</p>
            <button type="button" id="nav-admin-link" onclick="goToAdmin()" class="lm-btn">
                <i class="fas fa-server" aria-hidden="true"></i> 打开后台管理
            </button>
        </div>
    <!-- Logs Settings Panel -->
    <div id="settings-section-logs" data-settings-section="logs" class="hidden space-y-6 animate-fade-in h-96 flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h3 class="font-bold t-text-main text-lg flex items-center">
                <i class="fas fa-terminal mr-2 text-emerald-500"></i> 系统日志
            </h3>
            <div class="flex gap-2 flex-shrink-0">
                <button onclick="window.clearSystemLogs && window.clearSystemLogs()"
                    class="px-3 py-1.5 t-bg-track hover:t-bg-item-hover t-text-muted rounded-lg text-xs transition-colors whitespace-nowrap border t-border-main"
                    title="清空日志">
                    <i class="fas fa-trash-alt mr-1"></i>清空
                </button>
                <button onclick="window.renderSystemLogs && window.renderSystemLogs()"
                    class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs transition-colors whitespace-nowrap shadow-sm"
                    title="刷新">
                    <i class="fas fa-sync-alt mr-1"></i>刷新
                </button>
            </div>
        </div>

        <div
            class="flex-1 t-bg-main rounded-xl border t-border-main p-4 font-mono text-xs overflow-hidden flex flex-col shadow-inner">
            <div id="system-log-container"
                class="flex-1 overflow-y-auto custom-scrollbar space-y-1 t-bg-main t-text-main">
                <div class="t-text-muted italic text-center py-4 opacity-60">暂无日志...</div>
            </div>
        </div>
        <div class="text-[10px] t-text-muted text-right">
            * 显示系统启动后的 Console 输出
        </div>
    </div>
                <div id="settings-section-about" data-settings-section="about"
                    class="hidden">
                    <div
                        class="t-bg-panel rounded-2xl shadow-sm border t-border-main p-8 max-w-3xl mx-auto w-full prose prose-emerald">
                        <div id="about-content" class="animate-pulse">
                            <div class="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                            <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                            <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                            <div class="h-4 bg-gray-200 rounded w-2/3"></div>
                        </div>

                        <!-- Check for Updates Button -->
                        <div class="mt-8 pt-8 border-t t-border-main flex flex-col items-center gap-4">
                            <button onclick="checkForUpdates()"
                                class="flex items-center gap-2 px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-100 transition-all hover:scale-105 active:scale-95 text-sm font-bold group">
                                <i class="fas fa-sync-alt group-hover:rotate-180 transition-transform duration-500"></i>
                                检查版本更新
                            </button>
                            <p class="text-xs t-text-muted">点击通过云端检查是否有新版本可用</p>
                        </div>
                    </div>
                </div>
    </div>
        </div>
    </div>
</div>
`;


    /** 补齐设置项的图标和说明，已有问号及说明保持原样。 */
    function decorateSettings(container) {
        if (!container.querySelectorAll) return;
        const help = {
            '登录名': '创建账号时设置的登录标识，只读显示。',
            '用户名': '用于页面展示，最多 40 字；留空时使用登录名。',
            '原密码': '输入当前账号的登录密码。',
            '新密码': '设置 6–128 位新密码，保存后需要重新登录。',
            '确认新密码': '再次输入新密码，两次输入必须一致。',
            '检查更新（默认关闭）': '开启后允许服务端检查应用发布信息。',
            '检查更新服务器地址': '填写 GitHub 或 Gitea 的 latest release API 地址。',
            '访问令牌（可选）': '私有仓库可填写访问令牌；留空保留已有值。',
            '清除已保存令牌': '保存更新设置时删除已经保存的仓库访问令牌。',
            '启用 Token 认证': '开启后可使用当前账号生成的 Token 访问 API，支持禁用和有效期。',
            '上传头像': '选择最大 2 MB 的图片，拖动和缩放后确认裁剪。',
            '迁移洛雪配置': '上传洛雪 JSON 配置，迁移文件中提供的数据到当前账号。',
        };
        const icons = [
            [/密码|令牌|Token/, 'fa-key'], [/登录|用户|账号|头像/, 'fa-user'],
            [/更新/, 'fa-sync-alt'], [/网络|代理/, 'fa-globe'],
            [/颜色|主题/, 'fa-palette'], [/背景|图片|视觉|位置|模糊/, 'fa-image'],
            [/歌词|字体/, 'fa-language'], [/播放|音效|音量/, 'fa-headphones-alt'],
            [/缓存|记录|保存/, 'fa-database'], [/上传|迁移/, 'fa-file-import'],
        ];
        container.querySelectorAll('label, h3, h4, div.text-sm.font-bold').forEach(label => {
            const textNodes = Array.from(label.childNodes).filter(node => node.nodeType === 3 && node.textContent.trim());
            if (!textNodes.length) return;
            const title = textNodes.map(node => node.textContent.trim()).join(' ');
            if (label.closest('.setting-tooltip-content')) return;
            const caption = document.createElement('span');
            caption.className = 'settings-field-caption';
            label.insertBefore(caption, textNodes[0]);
            if (!label.querySelector('i:not(.fa-question-circle)')) {
                const icon = document.createElement('i');
                icon.className = 'fas ' + (icons.find(([pattern]) => pattern.test(title))?.[1] || 'fa-sliders-h');
                icon.setAttribute('aria-hidden', 'true');
                caption.append(icon);
            }
            textNodes.forEach(node => caption.append(node));
            if (!label.querySelector('.setting-tooltip-trigger')) {
                const trigger = document.createElement('span');
                trigger.className = 'setting-tooltip-trigger';
                trigger.tabIndex = 0;
                trigger.setAttribute('aria-label', title + '说明');
                const icon = document.createElement('i');
                icon.className = 'fas fa-question-circle';
                icon.setAttribute('aria-hidden', 'true');
                const content = document.createElement('span');
                content.className = 'setting-tooltip-content';
                const paragraph = label.parentElement?.querySelector('p');
                content.textContent = help[title] || paragraph?.textContent.trim() || ('设置' + title + '，修改后按当前页面的保存方式生效。');
                trigger.append(icon, content);
                caption.append(trigger);
            }
            if (label.tagName === 'LABEL' && label.querySelector('input:not([type="checkbox"]):not([type="file"])')) label.classList.add('settings-field');
        });
        container.querySelectorAll('.setting-tooltip-trigger').forEach(trigger => {
            if (!trigger.hasAttribute('tabindex')) trigger.tabIndex = 0;
        });
    }

    window.SettingsView = class SettingsView {
        /**
         * @param {HTMLElement|null} container 设置页面容器。
         * 重复挂载直接返回，避免清除输入草稿或重复初始化控件。
         */
        static mount(container) {
            if (!container || container.dataset.settingsMounted === 'true') return;
            container.innerHTML = template;
            decorateSettings(container);
            window.SettingsCards?.apply(container);
            container.dataset.settingsMounted = 'true';
        }
    };
    window.SettingsView.mount(document.getElementById('view-settings'));
})();
