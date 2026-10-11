/**
 * 全系统 Element Plus 控件适配：保留原生节点、字段 ID 与已有业务事件。
 * 简单按钮和文本使用官方控件结构；下拉、开关、滑块、颜色和上传使用 Vue 组件。
 * 新增弹窗和列表通过增量观察自动接入，移除时释放 Vue 实例。
 * @author jingyh
 * @date 2026-10-11
 */
(() => {
    const records = new Map(), widgets = new Set(), buttonStates = new WeakMap();
    const controls = 'button,input,textarea,select,a.btn-primary,a.btn-secondary,a.btn-quick,[role="button"],.elfinder-button:not(.elfinder-button-search)';
    const { createApp, h, shallowReactive } = window.Vue;
    const library = window.ElementPlus;
    document.documentElement.classList.add('lx-element-ui');

    /** 根据控件位置获取可读名称，去掉帮助提示内容，供键盘和读屏使用。 */
    function labelText(source) {
        let label = source.labels?.[0] || source.closest('label');
        if (!label?.textContent.trim()) label = source.closest('.flex.items-center.justify-between') || label;
        const copy = label?.cloneNode(true);
        copy?.querySelectorAll('input,select,textarea,.setting-tooltip-trigger,.lx-element-widget').forEach(node => node.remove());
        return source.getAttribute('aria-label') || copy?.textContent.trim().replace(/\s+/g, ' ').slice(0, 100) || source.placeholder || source.title || '设置选项';
    }

    /** 监听已有脚本的属性赋值；直接使用原描述符，保持原生校验、FormData 和字段语义。 */
    function watchProperty(source, name, notify) {
        const own = Object.getOwnPropertyDescriptor(source, name);
        let prototype = source, descriptor = own;
        while (!descriptor && (prototype = Object.getPrototypeOf(prototype))) descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor?.get || !descriptor?.set || own?.configurable === false) return () => {};
        Object.defineProperty(source, name, {
            configurable: true,
            get() { return descriptor.get.call(this); },
            set(value) { descriptor.set.call(this, value); notify(); },
        });
        return () => { if (own) Object.defineProperty(source, name, own); else delete source[name]; };
    }

    /** 统一按钮类型，保留导航选中态、纯图标按钮以及原来绑定的点击处理器。 */
    function button(source) {
        // 图片封面与磁贴自有布局，保留原生按钮语义，避免圆形内边距挤压图片。
        if (source.matches('.player-cover-button,.playlist-add-tile,.song-cover-button,.recent-play-button,.download-cover-button,.player-icon-button,.player-menu-item,.player-detail-toolbar button,#player-footer button,.song-row-more,.player-feature-header button')) return;
        const state = source.className.split(/\s+/).filter(name => !/^(el-button(?:--.*)?|lx-el-button|lx-el-navigation|is-circle|is-text|is-disabled)$/.test(name)).join(' ') + ':' + !!source.disabled;
        if (buttonStates.get(source) === state) return;
        buttonStates.set(source, state);
        source.classList.add('el-button', 'lx-el-button');
        // 手机音乐库复用桌面菜单节点，移出 nav 后仍按稳定 ID 保留导航语义。
        const navigation = source.matches('.settings-nav-item,.settings-collapse,.theme-option,.appearance-option,.nav-item,.system-settings-item,.lb-board-item,[data-view],[data-settings-target],a[id^="tab-"],nav a,.sidebar a');
        const copy = source.cloneNode(true);
        copy.querySelectorAll('i,svg,.setting-tooltip-trigger').forEach(node => node.remove());
        const iconOnly = !copy.textContent.trim();
        const primary = !navigation && /btn-primary|auth-submit|settings-action(?!-secondary)|lm-btn|bg-(emerald|pink|blue)-[56]00|bg-gradient/.test(source.className);
        const danger = !navigation && source.className.split(/\s+/).some(name => /^(btn-danger|btn-logout|bg-(red|rose)-|text-(red|rose)-)/.test(name));
        source.classList.toggle('lx-el-navigation', navigation);
        source.classList.toggle('is-circle', iconOnly);
        source.classList.toggle('el-button--primary', primary && !danger);
        source.classList.toggle('el-button--danger', danger);
        source.classList.toggle('is-text', navigation || iconOnly);
        if (source.disabled) source.classList.add('is-disabled'); else source.classList.remove('is-disabled');
    }

    /** 用官方输入结构包住原节点，避免替换节点导致事件、输入法或浏览器自动填充失效。 */
    function textInput(source) {
        if (records.has(source)) return;
        const outer = document.createElement('span');
        outer.className = 'el-input lx-el-input';
        outer.dataset.elementControl = source.type === 'number' ? 'number' : 'input';
        if (source.type === 'number') outer.classList.add('lx-el-number');
        const wrapper = document.createElement('span');
        wrapper.className = source.tagName === 'TEXTAREA' ? 'el-textarea' : 'el-input__wrapper';
        source.before(outer); outer.append(wrapper); wrapper.append(source);
        source.classList.add(source.tagName === 'TEXTAREA' ? 'el-textarea__inner' : 'el-input__inner');
        source.dataset.elementSource = 'text';
        const sync = () => {
            outer.classList.toggle('is-disabled', source.disabled);
            outer.classList.toggle('is-readonly', source.readOnly);
            const hidden = source.hidden || source.classList.contains('hidden') || source.style.display === 'none'; if (outer.hidden !== hidden) outer.hidden = hidden;
        };
        const stop = ['disabled', 'readOnly'].map(key => watchProperty(source, key, sync));
        const onFocus = () => wrapper.classList.add('is-focus'), onBlur = () => wrapper.classList.remove('is-focus');
        source.addEventListener('focus', onFocus); source.addEventListener('blur', onBlur);
        records.set(source, { host: outer, sync, stop, destroy: () => {
            source.removeEventListener('focus', onFocus); source.removeEventListener('blur', onBlur);
            source.classList.remove('el-input__inner', 'el-textarea__inner'); delete source.dataset.elementSource;
            if (outer.parentNode && outer.contains(source)) outer.before(source);
        } }); sync();
    }

    /** 将 Element 操作转回已有原生字段事件，输入预览与最终保存分别触发。 */
    function commit(source, value, eventType) {
        if (source.type === 'checkbox' || source.type === 'radio') source.checked = value;
        else source.value = value;
        source.dispatchEvent(new Event(eventType, { bubbles: true }));
    }

    /** 创建一个 Vue 控件，源字段继续参与原表单、校验和服务端提交。 */
    function widget(source, kind) {
        if (records.has(source)) return;
        const host = document.createElement('span');
        host.className = 'lx-element-widget lx-element-' + kind;
        host.dataset.elementControl = kind;
        if (kind === 'select') { host.classList.add('cs-wrapper'); if (source.id) host.id = 'cs-w-' + source.id; }
        source.before(host);
        const state = shallowReactive({ value: null, disabled: false, options: [], revision: 0 });
        const ref = { current: null };
        const initialTabIndex = source.getAttribute('tabindex');
        const initialAriaHidden = source.getAttribute('aria-hidden');
        const sync = () => {
            state.value = ['switch', 'checkbox', 'radio'].includes(kind) ? source.checked : kind === 'slider' ? Number(source.value) : source.value;
            state.disabled = source.disabled;
            if (kind === 'select') state.options = Array.from(source.options, option => ({ value: option.value, label: option.text, disabled: option.disabled || option.parentElement.disabled }));
            const hidden = source.hidden || source.classList.contains('hidden') && !['switch', 'checkbox', 'radio', 'upload'].includes(kind) || source.style.display === 'none'; if (host.hidden !== hidden) host.hidden = hidden;
            state.revision++;
        };
        source.dataset.elementSource = kind;
        source.classList.add('lx-element-source');
        if (kind === 'select') source.classList.add('cs-hidden');
        source.setAttribute('tabindex', '-1');
        source.setAttribute('aria-hidden', 'true');
        const name = labelText(source);
        const originalFocus = source.focus;
        source.focus = () => ref.current?.focus?.() || host.querySelector('input,button,[tabindex="0"]')?.focus();
        source.addEventListener('change', sync); source.addEventListener('input', sync);
        const stop = ['value', 'checked', 'disabled', 'readOnly'].map(key => watchProperty(source, key, sync));
        const change = value => {
            commit(source, value, 'input'); commit(source, value, 'change');
            // 原生 radio 会隐式取消同组字段，补齐其他 Vue 实例的显示状态。
            if (kind === 'radio') widgets.forEach(other => { if (other.type === 'radio' && other.name === source.name && other.form === source.form) records.get(other)?.sync(); });
        };
        const props = () => ({ modelValue: state.value, disabled: state.disabled, ref: value => { ref.current = value; }, ...(kind === 'checkbox' || kind === 'radio' ? { label: name } : { 'aria-label': name }), id: source.id ? source.id + '-element' : undefined });
        const render = () => {
            state.revision;
            if (kind === 'select') return h(library.ElSelect, {
                ...props(), filterable: state.options.length > 10, placeholder: source.getAttribute('placeholder') || '请选择',
                popperClass: 'lx-element-popper', appendTo: source.closest('dialog') || document.body,
                'onUpdate:modelValue': change, onVisibleChange: visible => host.classList.toggle('active', visible),
            }, () => state.options.map(option => h(library.ElOption, { key: option.value, ...option })));
            if (kind === 'slider') return h(library.ElSlider, { ...props(), min: Number(source.min || 0), max: Number(source.max || 100), step: source.step === 'any' ? 0.01 : Number(source.step || 1), showTooltip: true,
                'onUpdate:modelValue': value => commit(source, value, 'input'), onChange: value => commit(source, value, 'change') });
            if (kind === 'color') return h(library.ElColorPicker, { ...props(), 'onUpdate:modelValue': value => { if (value) commit(source, value, 'input'); }, onChange: value => { if (value) commit(source, value, 'change'); }, popperClass: 'lx-element-popper' });
            if (kind === 'upload') return h(library.ElUpload, {
                disabled: state.disabled, accept: source.accept, multiple: source.multiple, autoUpload: false, showFileList: false,
                onChange: file => { if (!file.raw) return; const transfer = new DataTransfer(); transfer.items.add(file.raw); source.files = transfer.files; source.dispatchEvent(new Event('change', { bubbles: true })); ref.current?.clearFiles?.(); },
                ref: value => { ref.current = value; },
            }, () => h(library.ElButton, { type: 'primary', plain: true, disabled: state.disabled }, () => name));
            return h(kind === 'switch' ? library.ElSwitch : kind === 'radio' ? library.ElRadio : library.ElCheckbox, { ...props(), ...(kind === 'radio' ? { value: true } : {}), 'onUpdate:modelValue': change });
        };
        // 阻止外层旧 label 再次触发隐藏源字段，确保每次点击仅提交一次。
        host.addEventListener('click', event => event.stopPropagation());
        host.addEventListener('input', event => event.stopPropagation());
        host.addEventListener('change', event => event.stopPropagation());
        const app = createApp({ render: () => h(library.ElConfigProvider, { locale: window.ElementPlusLocaleZhCn, zIndex: 20000 }, { default: render }) });
        records.set(source, { host, sync, stop, app, close: () => ref.current?.blur?.(), destroy: () => {
            source.removeEventListener('change', sync); source.removeEventListener('input', sync);
            source.focus = originalFocus; if (initialTabIndex === null) source.removeAttribute('tabindex'); else source.setAttribute('tabindex', initialTabIndex);
            if (initialAriaHidden === null) source.removeAttribute('aria-hidden'); else source.setAttribute('aria-hidden', initialAriaHidden);
            source.classList.remove('lx-element-source', 'cs-hidden'); delete source.dataset.elementSource;
        } });
        widgets.add(source); sync(); app.mount(host);
    }

    /** 接入已有控件；Element 自己生成的内部控件不再递归适配。 */
    function upgrade(source) {
        if (source.closest('.lx-element-widget,.el-overlay,.el-message,.el-popper') || source.dataset.elementSource || source.type === 'hidden') return;
        if (source.matches('button,a,[role="button"],.elfinder-button:not(.elfinder-button-search)')) { button(source); return; }
        if (source.tagName === 'SELECT') { widget(source, 'select'); return; }
        if (source.type === 'range') { widget(source, 'slider'); return; }
        if (source.type === 'color') { widget(source, 'color'); return; }
        if (source.type === 'file') {
            const label = source.labels?.[0] || source.closest('label');
            if (label) {
                const copy = label.cloneNode(true); copy.querySelectorAll('input,.setting-tooltip-trigger').forEach(node => node.remove());
                const title = copy.textContent.trim() || '选择文件';
                source.setAttribute('aria-label', title);
                widget(source, 'upload'); const host = records.get(source).host;
                label.before(host); label.classList.add('lx-element-source');
            } else if (!source.classList.contains('hidden') && source.style.display !== 'none') widget(source, 'upload');
            return;
        }
        if (source.type === 'checkbox' || source.type === 'radio') {
            const toggle = source.classList.contains('peer') && !source.classList.contains('platform-checkbox') || source.closest('.toggle-switch,.switch');
            const sibling = source.nextElementSibling;
            if (toggle && sibling) sibling.classList.add('lx-element-legacy-track');
            widget(source, toggle ? 'switch' : source.type === 'radio' ? 'radio' : 'checkbox'); return;
        }
        textInput(source);
    }

    /** 增量扫描新节点，避免播放进度更新时重复扫描整个页面。 */
    function scan(root) {
        if (root.nodeType !== 1 && root.nodeType !== 9 || root.closest?.('.lx-element-widget,.el-overlay,.el-message,.el-popper')) return;
        if (root.matches?.(controls)) upgrade(root);
        root.querySelectorAll(controls).forEach(upgrade);
    }
    function closeAll() { widgets.forEach(source => records.get(source)?.close?.()); }
    window.ElementControls = { upgrade, scan, sync: source => records.get(source)?.sync(), closeAll, watchProperty, commit };
    const observer = new MutationObserver(changes => {
        const pending = new Set();
        changes.forEach(change => {
            if (change.target.closest?.('.lx-element-widget,.el-overlay,.el-message,.el-popper')) return;
            if (change.type === 'childList') { change.addedNodes.forEach(node => scan(node)); if (change.target.closest?.('select')) pending.add(change.target.closest('select')); }
            else { const source = change.target; if (source.matches?.('button,a,[role="button"]')) button(source); if (records.has(source)) pending.add(source); }
        });
        pending.forEach(source => records.get(source)?.sync());
        records.forEach((record, source) => {
            if (source.isConnected) return;
            record.app?.unmount(); record.stop.forEach(stop => stop()); record.destroy?.();
            record.host.remove(); records.delete(source); widgets.delete(source);
        });
    });
    /** 表单重置不会经过 value setter，下一微任务重新读取原生默认值。 */
    document.addEventListener('reset', event => queueMicrotask(() => records.forEach((record, source) => { if (source.form === event.target) record.sync(); })), true);
    /** 共用 Element 消息框，取消返回原接口的布尔值或 null，不改变业务调用方式。 */
    function dialogs() {
        const messageText = value => String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '');
        const appendTo = () => document.querySelector('dialog[open]') || document.body;
        window.showToast = (type, message, duration = 3000) => {
            const types = ['success', 'info', 'warning', 'error'];
            if (!types.includes(type)) [type, message] = [types.includes(message) ? message : 'info', type];
            return library.ElMessage({ type, message: messageText(message), duration, showClose: true, grouping: true, zIndex: 20020, appendTo: appendTo() });
        };
        window.showSuccess = message => window.showToast('success', message, 2000);
        window.showInfo = message => window.showToast('info', message, 2000);
        window.showError = message => window.showToast('error', message, 3000);
        window.showSelect = (title, message, options = {}) => library.ElMessageBox.confirm(messageText(message), title, {
            confirmButtonText: options.confirmText || '确定', cancelButtonText: options.cancelText || '取消',
            type: options.danger ? 'warning' : 'info', confirmButtonClass: options.danger ? 'el-button--danger' : '',
            closeOnClickModal: false, zIndex: 20000, appendTo: appendTo(),
        }).then(() => true, () => false);
        window.showInput = (title, message, options = {}) => library.ElMessageBox.prompt(messageText(message), title, {
            confirmButtonText: options.confirmText || '确定', cancelButtonText: options.cancelText || '取消',
            inputValue: options.defaultValue || '', inputPlaceholder: options.placeholder || '请输入内容', inputType: options.inputType || 'text',
            inputPattern: options.inputPattern, inputValidator: options.inputValidator, closeOnClickModal: false, zIndex: 20000, appendTo: appendTo(),
        }).then(result => result.value?.trim() || null, () => null);
    }
    function start() { dialogs(); scan(document); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'hidden', 'style', 'value', 'checked', 'min', 'max', 'step'] }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
