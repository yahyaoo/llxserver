/** 顶部设置、主题、账号和安装应用组件。 @author jingyh @date 2026-10-10 */
(() => {
    window.TopAccountActions = class {
        static mount(container) {
            container.innerHTML = `<div class="header-actions">
                <button id="header-settings-trigger" class="top-icon-button" onclick="toggleSettingsPage()" title="设置" aria-label="设置" aria-expanded="false" aria-controls="view-settings"><i class="fas fa-cog"></i></button>
                <button id="sleep-timer-trigger" class="top-icon-button" onclick="openSleepTimerModal()" title="睡眠定时" aria-label="睡眠定时"><i class="far fa-clock"></i><span id="sleep-timer-countdown" class="hidden"></span></button>
                <div class="header-dropdown" data-header-dropdown>
                    <button id="header-notice-trigger" class="top-icon-button" onclick="toggleHeaderDropdown('header-notice-menu')" title="消息中心" aria-label="消息中心" aria-expanded="false" aria-controls="header-notice-menu"><i class="far fa-bell"></i></button>
                    <div id="header-notice-menu" class="header-dropdown-panel notice-panel hidden" data-header-menu data-header-trigger="header-notice-trigger"></div>
                </div>
                <div class="header-dropdown" data-header-dropdown>
                    <button id="header-theme-trigger" class="header-menu-trigger" onclick="toggleHeaderDropdown('header-theme-menu')" aria-expanded="false" aria-controls="header-theme-menu" aria-label="选择主题与外观"><i class="fas fa-palette"></i><span id="header-theme-label">樱花粉</span><i class="fas fa-chevron-down"></i></button>
                    <div id="header-theme-menu" class="header-dropdown-panel theme-menu hidden" data-header-menu data-header-trigger="header-theme-trigger"><p class="header-menu-title">主题与外观</p><div data-theme-controls></div><button class="theme-more" onclick="closeHeaderDropdowns(); switchTab('settings'); selectSettingsSection('theme')">自定义颜色与图片背景 <i class="fas fa-arrow-right"></i></button></div>
                </div>
                <div id="header-user-info" class="header-dropdown" data-header-dropdown>
                    <button id="header-account-trigger" class="header-menu-trigger" onclick="toggleHeaderDropdown('header-account-menu')" aria-expanded="false" aria-controls="header-account-menu" aria-label="账户菜单"><span class="header-avatar"><i class="fas fa-user"></i></span><span id="header-account-label">账户</span><span id="header-user-display" class="hidden items-center"><span id="header-username"></span></span></button>
                    <div id="header-account-menu" class="header-dropdown-panel account-menu hidden" data-header-menu data-header-trigger="header-account-trigger">
                        <button onclick="closeHeaderDropdowns(); openAccountSettings()"><i class="fas fa-user-cog"></i>账号设置</button>
                        <button onclick="closeHeaderDropdowns(); openAccountPasswordDialog()"><i class="fas fa-key"></i>修改密码</button>
                        <button id="header-sync-logout" class="hidden account-logout" onclick="closeHeaderDropdowns(); handleHeaderLogout(event)"><i class="fas fa-sign-out-alt"></i>退出登录</button>

                    </div>
                </div>
                <button id="pwa-install-btn" class="hidden header-menu-trigger" title="安装应用"><i class="fas fa-download"></i><span>安装应用</span></button>
            </div>`;
        }
    };
})();
