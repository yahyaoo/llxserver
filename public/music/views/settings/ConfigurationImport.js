/** 洛雪配置上传入口，沿用现有认证、提示和数据刷新流程。 @author yahyaoo */
(function () {
    'use strict';
    /** @param {File} file 用户选择的 JSON 文件。 @returns {Promise<void>} 上传及刷新结果。 */
    async function upload(file) {
        const status = document.getElementById('configuration-import-status');
        const button = document.getElementById('configuration-import-button');
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) throw new Error('配置文件不能超过 20 MB');
        button.disabled = true;
        status.textContent = '正在迁移配置…';
        try {
            const body = new FormData();
            body.append('file', file);
            const request = window.fetchDownloadWithAuth || fetch;
            const response = await request('/api/music/configuration/import', { method: 'POST', body });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || '配置迁移失败');
            status.textContent = `迁移完成：${result.playlists} 个歌单，${result.songs} 首歌曲。`;
            // 只在服务器确认提交后重载；浏览器缓存由原初始化流程刷新。
            if (window.ListStore) await window.ListStore.remove();
            if (window.showToast) window.showToast('success', '洛雪配置迁移完成，即将刷新');
            window.location.reload();
        } finally {
            button.disabled = false;
        }
    }
    /** 打开文件选择器，覆盖含义由设置页文字明确展示。 */
    window.selectLxConfiguration = function () { document.getElementById('configuration-import-file').click(); };
    /** @param {HTMLInputElement} input 文件控件。选择文件后上传，允许再次选择相同文件。 */
    window.importLxConfiguration = async function (input) {
        try { await upload(input.files[0]); }
        catch (error) {
            document.getElementById('configuration-import-status').textContent = error.message;
            if (window.showToast) window.showToast('error', error.message);
        } finally { input.value = ''; }
    };
})();
