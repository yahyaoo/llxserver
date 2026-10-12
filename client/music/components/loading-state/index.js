/** 通用加载展示，只生成视图，不管理请求或业务状态。 @author jingyh @date 2026-10-12 */
(function () {
    const variants = new Set(['page', 'section', 'inline']);

    /** 状态文字按纯文本转义，避免歌曲名、目录或接口消息注入 HTML。 */
    function escapeText(value) {
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    /** 页面/区域居中展示；inline 用于侧栏、标题及其他狭小区域。 */
    function render(message = '正在加载…', variant = 'section') {
        const size = variants.has(variant) ? variant : 'section';
        return `<span class="lx-loading lx-loading--${size}" role="status" aria-live="polite"><span class="lx-loading-art" aria-hidden="true"><span class="lx-loading-bars"><span></span><span></span><span></span><span></span><span></span></span></span><span class="lx-loading-label">${escapeText(message)}</span></span>`;
    }

    /** 同步装配模板占位；不观察后续 DOM，不干预原有隐藏/显示流程。 */
    function mount(root = document) {
        root.querySelectorAll('[data-loading-label]').forEach(host => {
            host.innerHTML = render(host.dataset.loadingLabel, host.dataset.loadingVariant);
            host.removeAttribute('data-loading-label');
            host.removeAttribute('data-loading-variant');
        });
    }

    window.LoadingState = { render, mount };
    mount();
    // 脚本后的静态弹窗也要装配；只在文档解析结束时再检查一次。
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
})();
