/**
 * 设置分组导航组件，仅负责目录渲染、选中态和选择回调。
 * @author yahyaoo
 * @date 2026-10-10
 */
window.SettingsNavigationComponent = class SettingsNavigationComponent {
    /**
     * @param {HTMLElement} container 导航挂载容器。
     * @param {Array} groups 分组及子项配置。
     * @param {Function} onSelect 子项选择回调，由设置页面处理内容切换。
     */
    constructor(container, groups, onSelect) {
        this.container = container;
        this.groups = groups;
        this.onSelect = onSelect;
        this.buttons = new Map();
    }

    /** 挂载目录；重复调用不会堆叠按钮或监听器。 */
    render() {
        this.container.replaceChildren();
        this.buttons.clear();
        this.groups.forEach(group => {
            const section = document.createElement('section');
            section.className = 'settings-nav-group';
            const heading = document.createElement('h3');
            heading.className = 'settings-nav-heading';
            heading.textContent = group.label;
            section.appendChild(heading);
            group.items.forEach(item => section.appendChild(this.createItem(item)));
            this.container.appendChild(section);
        });
    }

    /** @param {Object} item 子项配置。 @returns {HTMLButtonElement} 可键盘操作的导航按钮。 */
    createItem(item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-nav-item';
        button.dataset.settingsTarget = item.id;
        button.setAttribute('aria-controls', item.id === 'logs' ? 'settings-panel-logs' : `settings-section-${item.id}`);
        button.title = item.label;
        const icon = document.createElement('i');
        icon.className = `fas ${item.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'settings-nav-label';
        label.textContent = item.label;
        button.append(icon, label);
        button.addEventListener('click', () => this.onSelect(item.id));
        this.buttons.set(item.id, button);
        return button;
    }

    /** @param {string} sectionId 当前子项标识，只更新视觉和无障碍状态。 */
    setActive(sectionId) {
        this.buttons.forEach((button, id) => {
            const selected = id === sectionId;
            button.setAttribute('aria-current', selected ? 'page' : 'false');
            button.classList.toggle('is-active', selected);
        });
    }
};
