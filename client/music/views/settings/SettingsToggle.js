/** 设置页面可逆展开，复用现有节点并保留页面参数及草稿。 @author jingyh @date 2026-10-10 */
(() => {
    const tabClasses = ['active-tab', 'text-emerald-600', 't-text-muted'];
    class SettingsToggle {
        constructor() { this.previous = null; this.animation = null; this.revision = 0; this.closing = false; this.settingsScroll = []; }

        /** 记录实际滚动节点，隐藏与恢复页面不重新查询或加载业务数据。 */
        readScroll(nodes) {
            return nodes.filter(Boolean).map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }));
        }

        restoreScroll(records) {
            records.forEach(({ node, top, left }) => { node.scrollTop = top; node.scrollLeft = left; });
        }

        rememberSettingsScroll() {
            this.settingsScroll = this.readScroll(['view-settings', 'settings-shell', 'settings-content', 'settings-sidebar', 'settings-navigation'].map(id => document.getElementById(id)));
        }

        /** 取消旧动画并使它的完成回调失效，连续点击不会恢复错误的页面。 */
        cancelAnimation() {
            ++this.revision;
            this.animation?.cancel();
            this.animation = null;
            document.getElementById('view-settings')?.classList.remove('settings-opening', 'settings-closing');
        }

        /** 从右上角展开或向右上角收回；尊重系统减少动态效果设置。 */
        play(open, complete = () => {}) {
            const view = document.getElementById('view-settings');
            const current = this.animation && typeof getComputedStyle === 'function' ? getComputedStyle(view) : null;
            const starting = current ? { opacity: current.opacity, clipPath: current.clipPath, transform: current.transform } : null;
            this.cancelAnimation();
            const revision = this.revision;
            if (!view.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { complete(); return; }
            view.classList.add(open ? 'settings-opening' : 'settings-closing');
            const collapsed = { opacity: 0, clipPath: 'inset(0 0 100% 100% round 24px)', transform: 'translate(12px, -8px) scale(.98)' };
            const expanded = { opacity: 1, clipPath: 'inset(0 0 0 0 round 0px)', transform: 'none' };
            const animation = view.animate([starting || (open ? collapsed : expanded), open ? expanded : collapsed], { duration: 320, easing: open ? 'cubic-bezier(.16, 1, .3, 1)' : 'cubic-bezier(.4, 0, .8, 1)', fill: 'both' });
            this.animation = animation;
            animation.finished.then(() => {
                if (revision !== this.revision) return;
                complete();
                this.animation = null;
                view.classList.remove('settings-opening', 'settings-closing');
                animation.cancel();
            }, () => {});
        }

        /** 只显示设置，既不重建控件，也不退出原页面的搜索、筛选和批量模式。 */
        show() {
            const view = document.getElementById('view-settings');
            if (!view || (!view.classList.contains('hidden') && !this.closing)) return;
            if (!this.previous) {
                const views = [...document.querySelectorAll('.music-shell [id^="view-"]')].filter(node => node !== view && !node.classList.contains('hidden'));
                this.previous = {
                    views,
                    scroll: this.readScroll(views.flatMap(node => [node, ...node.querySelectorAll('*')]).filter(node => node.scrollTop || node.scrollLeft)),
                    tabs: [...document.querySelectorAll('[id^="tab-"]')].map(node => ({ node, classes: tabClasses.map(name => node.classList.contains(name)) })),
                    title: document.getElementById('page-title')?.textContent,
                };
                views.forEach(node => node.classList.add('hidden'));
            }
            this.closing = false;
            view.classList.remove('hidden', 'opacity-0'); view.classList.add('opacity-100');
            this.restoreScroll(this.settingsScroll);
            this.previous.tabs.forEach(({ node }) => {
                node.classList.toggle('active-tab', node.id === 'tab-settings');
                node.classList.toggle('t-text-muted', node.id !== 'tab-settings');
                node.classList.remove('text-emerald-600');
            });
            const title = document.getElementById('page-title'); if (title) title.textContent = '设置';
            document.getElementById('header-settings-trigger')?.setAttribute('aria-expanded', 'true');
            window.closeHeaderDropdowns?.();
            window.CustomSelectManager?.closeAll();
            this.play(true);
        }

        /** 收起后恢复原显示节点、滚动和导航高亮；参数与设置值始终保留。 */
        hide() {
            if (!this.previous) return;
            this.closing = true;
            this.rememberSettingsScroll();
            window.closeHeaderDropdowns?.();
            window.CustomSelectManager?.closeAll();
            document.getElementById('header-settings-trigger')?.setAttribute('aria-expanded', 'false');
            this.play(false, () => {
                const view = document.getElementById('view-settings');
                view.classList.add('hidden');
                const previous = this.previous;
                previous.views.forEach(node => node.classList.remove('hidden'));
                this.restoreScroll(previous.scroll);
                previous.tabs.forEach(({ node, classes }) => tabClasses.forEach((name, index) => node.classList.toggle(name, classes[index])));
                const title = document.getElementById('page-title'); if (title) title.textContent = previous.title;
                this.previous = null; this.closing = false;
            });
        }

        toggle() {
            const view = document.getElementById('view-settings');
            if (view?.classList.contains('hidden') || this.closing) this.show(); else this.hide();
        }

        /** 用户转到其他页面时交回普通导航，取消尚未结束的返回操作。 */
        discard() {
            if (!this.previous) return;
            this.rememberSettingsScroll();
            this.cancelAnimation();
            this.previous = null; this.closing = false;
            document.getElementById('header-settings-trigger')?.setAttribute('aria-expanded', 'false');
        }
    }
    window.settingsPageToggle = new SettingsToggle();
    window.toggleSettingsPage = () => window.settingsPageToggle.toggle();
})();
