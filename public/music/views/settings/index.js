/** 设置分组导航及顶部下拉交互。 @author yahyaoo @date 2026-10-10 */
// 导航只引用现有分组标识，不创建新的业务设置。
const SETTINGS_NAVIGATION = [
    { id: 'system', label: '系统', icon: 'fa-sliders-h', items: [
        { id: 'sources', label: '源与基础设置', icon: 'fa-server' },
        { id: 'network', label: '网络设置', icon: 'fa-globe' },
        { id: 'updates', label: '版本更新', icon: 'fa-arrow-circle-up' },
        { id: 'sync', label: '数据同步', icon: 'fa-sync-alt' },
        { id: 'auto-update', label: '自动更新', icon: 'fa-history' },
        { id: 'cache', label: '本地缓存与重置', icon: 'fa-database' },
    ] },
    { id: 'display', label: '显示', icon: 'fa-desktop', items: [
        { id: 'layout', label: '界面与布局', icon: 'fa-columns' },
        { id: 'visuals', label: '播放背景与视觉特效', icon: 'fa-image' },
        { id: 'lyrics', label: '歌词显示设置', icon: 'fa-language' },
    ] },
    { id: 'logic', label: '逻辑', icon: 'fa-microchip', items: [
        { id: 'queue', label: '播放队列与列表', icon: 'fa-list-ul' },
        { id: 'playback', label: '播放体验强化', icon: 'fa-headphones-alt' },
        { id: 'recovery', label: '播放失败处理策略', icon: 'fa-shield-alt' },
        { id: 'devices', label: '系统交互与外设', icon: 'fa-keyboard' },
    ] },
    { id: 'logs', label: '日志', icon: 'fa-terminal', items: [
        { id: 'logs', label: '系统日志', icon: 'fa-terminal' },
    ] },
];
let activeSettingsSection = 'sources';
let settingsNavigationComponent;

/**
 * 仅切换现有控件的显示状态，不重建控件或修改设置值。
 * @param {string} sectionId 设置子项标识，无效标识保持当前页面不变。
 */
function selectSettingsSection(sectionId) {
    const group = SETTINGS_NAVIGATION.find(group => group.items.some(item => item.id === sectionId));
    if (!group) return;
    const item = group.items.find(item => item.id === sectionId);
    activeSettingsSection = sectionId;
    SETTINGS_NAVIGATION.forEach(({ id }) => {
        document.getElementById(`settings-panel-${id}`)?.classList.toggle('hidden', id !== group.id);
    });
    document.querySelectorAll('[data-settings-section]').forEach(section => {
        section.classList.toggle('hidden', section.dataset.settingsSection !== sectionId);
    });
    settingsNavigationComponent?.setActive(sectionId);
    document.getElementById('settings-section-title').textContent = item.label;
    document.getElementById('settings-section-group').textContent = group.label;
    document.getElementById('settings-mobile-label').textContent = item.label;
    document.getElementById('settings-content').scrollTop = 0;
    setSettingsMobileOpen(false);
    if (sectionId === 'logs' && window.renderSystemLogs) window.renderSystemLogs();
}

/** 保留旧的分组切换入口。 @param {string} groupId 大功能分组标识。 */
function switchSettingsTab(groupId) {
    const group = SETTINGS_NAVIGATION.find(group => group.id === groupId);
    if (group) selectSettingsSection(group.items[0].id);
}

/** 同步手机目录显示及无障碍状态。 @param {boolean} open 是否展开目录。 */
function setSettingsMobileOpen(open) {
    document.getElementById('settings-shell')?.classList.toggle('mobile-nav-open', open);
    document.getElementById('settings-mobile-toggle')?.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('settings-navigation').scrollTop = 0;
}

/** 展开或收起手机端设置目录。 */
function toggleSettingsMobileNavigation() {
    const shell = document.getElementById('settings-shell');
    setSettingsMobileOpen(!shell.classList.contains('mobile-nav-open'));
}

/** 桌面收起后保留图标、提示及选中态，仍可直接访问每个子项。 */
function toggleSettingsNavigation() {
    const collapsed = document.getElementById('settings-shell').classList.toggle('nav-collapsed');
    const button = document.getElementById('settings-collapse');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? '展开设置导航' : '收起设置导航');
    button.title = collapsed ? '展开设置导航' : '收起设置导航';
}

/**
 * 关闭所有顶部下拉，避免两个浮层同时遮挡内容。
 * @param {boolean} restoreFocus 是否把键盘焦点还给原触发按钮。
 */
function closeHeaderDropdowns(restoreFocus = false) {
    document.querySelectorAll('[data-header-menu]').forEach(menu => {
        const wasOpen = !menu.classList.contains('hidden');
        menu.classList.add('hidden');
        const trigger = document.getElementById(menu.dataset.headerTrigger);
        trigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus && wasOpen) trigger?.focus();
    });
}

/** 开关指定下拉并关闭另一菜单。 @param {string} menuId 下拉容器标识。 */
function toggleHeaderDropdown(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const open = menu.classList.contains('hidden');
    closeHeaderDropdowns();
    menu.classList.toggle('hidden', !open);
    document.getElementById(menu.dataset.headerTrigger)?.setAttribute('aria-expanded', String(open));
}

/**
 * 按播放器实际占用高度预留空间，适配音频可视化、窗口尺寸和播放器收起。
 * 监听现有播放器的尺寸及展示状态，不修改播放器本身的逻辑。
 */
function initSettingsHeight() {
    const footer = document.getElementById('player-footer');
    const view = document.getElementById('view-settings');
    if (!footer || !view) return;
    const update = () => {
        const rect = footer.getBoundingClientRect();
        // 浮动播放器下方还有安全间距，按顶部边界预留整个占用区域。
        const visible = rect.height > 0 && rect.top + rect.height > 0 && rect.top < window.innerHeight;
        const height = visible ? Math.min(window.innerHeight, window.innerHeight - rect.top) : 0;
        view.style.setProperty('--settings-player-height', `${height}px`);
    };
    update();
    window.addEventListener('resize', update);
    footer.addEventListener('transitionend', update);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(footer);
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(update).observe(footer, { attributes: true, attributeFilter: ['class', 'style'] });
    }
}

/** 构建分组导航，内容仍由页面中的原有设置区域提供。 */
function initSettingsNavigation() {
    const navigation = document.getElementById('settings-navigation');
    if (!navigation) return;
    settingsNavigationComponent = new window.SettingsNavigationComponent(navigation, SETTINGS_NAVIGATION, selectSettingsSection);
    settingsNavigationComponent.render();
    selectSettingsSection(activeSettingsSection);
    initSettingsHeight();
    document.addEventListener('click', event => {
        if (!event.target.closest('[data-header-dropdown]')) closeHeaderDropdowns();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeHeaderDropdowns(true);
            setSettingsMobileOpen(false);
        }
    });
}
document.addEventListener('DOMContentLoaded', initSettingsNavigation);
