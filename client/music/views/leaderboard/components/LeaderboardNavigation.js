/**
 * 榜单目录组件，负责按钮渲染和选中态，数据加载与播放仍由原业务模块处理。
 * @author jingyh
 * @date 2026-10-10
 */
window.LeaderboardNavigationComponent = class LeaderboardNavigationComponent {
    /**
     * @param {HTMLElement} container 榜单目录挂载容器。
     * @param {Function} onSelect 原始榜单标识和名称的选择回调。
     */
    constructor(container, onSelect) {
        this.container = container;
        this.onSelect = onSelect;
        this.buttons = new Map();
    }

    /**
     * 重新渲染目录；名称作为文本写入，避免引号或标签影响回调与显示。
     * @param {Array} boards 原业务模块返回的榜单列表。
     * @param {string|number|null} activeId 当前选中的榜单标识。
     */
    render(boards, activeId) {
        this.container.replaceChildren();
        this.buttons.clear();
        if (!boards || boards.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'leaderboard-navigation-empty';
            empty.textContent = '暂无榜单';
            this.container.append(empty);
            return;
        }
        boards.forEach((board, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `lb-board-${board.bangid}`;
            button.className = 'lb-board-item leaderboard-navigation-item';
            button.title = board.name;
            button.setAttribute('aria-controls', 'lb-songs-container');
            const number = document.createElement('span');
            number.className = 'leaderboard-navigation-number';
            number.textContent = String(index + 1);
            number.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'leaderboard-navigation-label';
            label.textContent = board.name;
            button.append(number, label);
            button.addEventListener('click', () => this.onSelect(board.bangid, board.name));
            this.buttons.set(String(board.bangid), button);
            this.container.append(button);
        });
        this.setActive(activeId);
    }

    /** @param {string|number|null} activeId 当前榜单标识，仅更新目录视觉状态。 */
    setActive(activeId) {
        this.buttons.forEach((button, id) => {
            const selected = activeId != null && id === String(activeId);
            button.classList.toggle('active-option', selected);
            button.setAttribute('aria-current', selected ? 'page' : 'false');
        });
    }
};
