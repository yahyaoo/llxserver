/** 歌曲下载浮层及服务器文件下载入口。 @author jingyh */
(() => {
    let active = null, lastTrigger = null, lastPoint = null, lastRect = null;
    // 在更多菜单收起前保存点击坐标，菜单隐藏后不能再用零尺寸矩形定位。作者：yahyaoo
    document.addEventListener('pointerdown', event => {
        lastTrigger = event.target.closest('button');
        lastPoint = lastTrigger ? { x: event.clientX, y: event.clientY } : null;
        lastRect = lastTrigger?.getBoundingClientRect();
    }, true);
    const anchor = () => document.activeElement?.tagName === 'BUTTON' ? document.activeElement : lastTrigger;
    function close(result = null, restoreFocus = false) {
        if (!active) return;
        const previous = active; active = null;
        previous.panel.remove();
        previous.trigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) previous.trigger?.focus();
        previous.resolve(result);
    }
    function position() {
        if (!active) return;
        const { panel, rect, point } = active;
        const width = panel.offsetWidth, height = panel.offsetHeight;
        const x = point?.x ?? (rect ? rect.right - width : (innerWidth - width) / 2);
        const y = point?.y ?? rect?.bottom;
        panel.style.left = Math.max(12, Math.min(x, innerWidth - width - 12)) + 'px';
        panel.style.top = Math.max(12, Math.min(y == null ? (innerHeight - height) / 2 : y + height + 20 <= innerHeight ? y + 8 : y - height - 8, innerHeight - height - 12)) + 'px';
    }
    window.DownloadOptions = {
        anchor,
        choose({ title = '下载歌曲', name, qualities, labels, quality, target = '浏览器下载', trigger = anchor() }) {
            close();
            return new Promise(resolve => {
                const panel = document.createElement('form');
                panel.className = 'download-options-popover';
                panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
                panel.innerHTML = '<h3></h3><button type="button" class="download-options-close" aria-label="关闭下载选项"><i class="fas fa-times"></i></button><p></p>'
                    + '<label>下载位置<select name="target" aria-label="下载位置"><option value="浏览器下载">此设备</option><option value="服务器下载">部署服务器</option></select></label>'
                    + '<label>音质<select name="quality" aria-label="下载音质"></select></label>'
                    + '<label data-download-lyrics hidden>歌词写入<select name="lyricMode" aria-label="歌词写入"><option value="">使用服务器设置</option><option value="embedded">内嵌到音频</option><option value="external">外部 .lrc 文件</option></select></label>'
                    + '<button type="submit" class="download-options-submit">开始下载</button>';
                panel.querySelector('h3').textContent = title;
                panel.querySelector('p').textContent = name;
                const qualitySelect = panel.elements.quality;
                qualities.forEach((code, index) => { const option = document.createElement('option'); option.value = code; option.textContent = labels[index] || code; qualitySelect.appendChild(option); });
                if (quality && qualities.includes(quality)) qualitySelect.value = quality;
                panel.elements.target.value = target;
                const toggleLyrics = () => { panel.querySelector('[data-download-lyrics]').hidden = panel.elements.target.value !== '服务器下载'; position(); };
                panel.elements.target.addEventListener('change', toggleLyrics);
                panel.querySelector('.download-options-close').addEventListener('click', () => close(null, true));
                panel.addEventListener('submit', event => {
                    event.preventDefault();
                    close({ target: panel.elements.target.value, quality: qualitySelect.value, lyricMode: panel.elements.lyricMode.value || undefined }, true);
                });
                const rect = trigger === lastTrigger ? lastRect : trigger?.getBoundingClientRect();
                const point = trigger === lastTrigger ? lastPoint : null;
                active = { panel, trigger, resolve, rect, point }; document.body.appendChild(panel);
                trigger?.setAttribute('aria-expanded', 'true'); toggleLyrics(); qualitySelect.focus({ preventScroll: true });
            });
        },
    };
    document.addEventListener('click', event => { if (active && !active.panel.contains(event.target) && !active.trigger?.contains(event.target)) close(); });
    document.addEventListener('keydown', event => { if (active && event.key === 'Escape') { event.preventDefault(); close(null, true); } });
    // 歌词自动滚动和控件聚焦不应取消用户的下载选择。作者：yahyaoo
    document.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);

    /** 从部署服务器取原文件，缓存目录和自定义目录均不经过云端解析。 */
    window.downloadLibraryFile = (item, { username, custom = false } = {}) => {
        const filename = item.filename || item._localFilename;
        if (!filename) { window.showError?.('未找到服务器文件'); return false; }
        const owner = username || item._localUsername || window.getUserAuthHeaders?.()['x-user-name'];
        const token = window.getUserAuthHeaders?.()['x-user-token'] || window.AccountSession?.getToken() || '';
        const params = new URLSearchParams({ download: '1' });
        if (token) params.set('token', token);
        let path;
        if (custom || item.isCustomDir || item._isCustomDir || item.folder === 'custom') {
            params.set('filename', filename); params.set('user', owner || '');
            path = '/api/music/custom/file';
        } else {
            params.set('folder', item.folder || item._localFolder || 'music');
            path = '/api/music/cache/file/' + encodeURIComponent(owner || '') + '/' + encodeURIComponent(filename);
        }
        const link = document.createElement('a'); link.href = path + '?' + params;
        link.download = filename.split(/[\\/]/).pop(); link.hidden = true;
        document.body.appendChild(link); link.click(); link.remove();
        return true;
    };
})();
