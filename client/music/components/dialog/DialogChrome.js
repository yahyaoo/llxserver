/** 为静态及动态弹框统一紧凑标题栏，关闭仍调用原业务入口。 @author jingyh */
(() => {
    function isCloseButton(button) {
        return button.classList.contains('el-message-box__headerbtn') || button.querySelector('.fa-times, .fa-xmark, .fa-times-circle') || /关闭/.test(button.getAttribute('aria-label') || '');
    }
    /** 从标题向上查找最近的关闭按钮，避免将包含正文的外层容器当成标题栏。 */
    function findHeading(title, panel) {
        let candidate = title.parentElement;
        while (candidate && candidate !== panel) {
            if ([...candidate.querySelectorAll('button')].some(isCloseButton)) return candidate;
            candidate = candidate.parentElement;
        }
        return title;
    }
    function enhance(overlay) {
        if (overlay.dataset.dialogChrome === 'true') return;
        const title = overlay.querySelector('h2, h3, h4, .el-message-box__title');
        if (!title || title.closest('[id^="view-"]')) return;
        let panel = title;
        while (panel.parentElement && panel.parentElement !== overlay) panel = panel.parentElement;
        if (panel === title && overlay.tagName !== 'DIALOG') return;
        if (overlay.tagName === 'DIALOG' || overlay.classList.contains('el-message-box')) panel = overlay;
        let heading = findHeading(title, panel);
        // 标题直接放在内容面板内时建立专用标题栏，不挪动表单与操作按钮。
        if (heading === title) {
            heading = document.createElement('div'); title.before(heading); heading.append(title);
        }
        // 将嵌套标题栏移到面板首层，原内容容器继续负责正文滚动与间距。
        if (heading.parentElement !== panel) panel.prepend(heading);
        overlay.dataset.dialogChrome = 'true';
        overlay.classList.add('lx-dialog-overlay'); panel.classList.add('lx-dialog-panel');
        heading.classList.add('lx-dialog-heading'); title.classList.add('lx-dialog-title');
        if (overlay.tagName !== 'DIALOG') overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        if (!title.id) title.id = 'lx-dialog-title-' + (++enhance.count);
        overlay.setAttribute('aria-labelledby', title.id);
        let close = [...heading.querySelectorAll('button')].find(isCloseButton);
        if (!close) {
            close = [...panel.children].find(node => node.tagName === 'BUTTON' && isCloseButton(node));
            if (close) heading.append(close);
        }
        if (!close) {
            const cancel = [...panel.querySelectorAll('button')].find(button => /^(取消|关闭|返回|暂不|稍后)/.test(button.textContent.trim()));
            close = document.createElement('button'); close.type = 'button';
            close.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
            close.addEventListener('click', () => {
                if (cancel) cancel.click();
                else if (overlay.tagName === 'DIALOG') overlay.close();
                else if (overlay.onclick) overlay.click();
                else { overlay.classList.add('hidden'); overlay.classList.remove('flex'); }
            });
            heading.append(close);
        }
        close.classList.add('lx-dialog-close'); close.setAttribute('aria-label', '关闭' + title.textContent.trim());
        // 仅处理面板外层分区；内部卡片、输入框保留自己的间距。
        [...panel.children].forEach(section => {
            if (section !== heading && section.tagName !== 'SCRIPT') section.classList.add('lx-dialog-section');
        });
    }
    enhance.count = 0;
    function scan(root) {
        if (root.nodeType !== 1 && root !== document) return;
        const selector = 'dialog, .fixed.inset-0, .el-message-box';
        if (root.matches?.(selector)) enhance(root);
        root.querySelectorAll(selector).forEach(enhance);
    }
    let observer;
    const waiting = new Map();
    function watchPending(root) {
        const selector = 'dialog, .fixed.inset-0, .el-message-box';
        const overlays = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
        for (const overlay of overlays) if (overlay.dataset.dialogChrome !== 'true' && !waiting.has(overlay)) {
            const pending = new MutationObserver(() => {
                if (!overlay.isConnected) { pending.disconnect(); waiting.delete(overlay); return; }
                enhance(overlay);
                if (overlay.dataset.dialogChrome === 'true') { pending.disconnect(); waiting.delete(overlay); }
            });
            waiting.set(overlay, pending); pending.observe(overlay, { childList: true, subtree: true });
        }
    }
    function destroy() { observer?.disconnect(); for (const pending of waiting.values()) pending.disconnect(); waiting.clear(); }
    window.DialogChrome = { enhance, scan, destroy };
    function init() {
        if (observer) return;
        scan(document);
        // 所有动态弹层挂到body；只看body直属新增宿主，不观察歌曲/歌词子树。
        observer = new MutationObserver(records => {
            window.PerfProbe?.count('observer:dialog');
            for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) { scan(node); watchPending(node); }
            for (const [overlay, pending] of waiting) if (!overlay.isConnected) { pending.disconnect(); waiting.delete(overlay); }
        });
        observer.observe(document.body, { childList: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
    window.addEventListener('pagehide', event => { if (!event.persisted) destroy(); });
})();
