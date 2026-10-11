/** 独立下载管理页面，复用现有队列和任务操作。 @author jingyh */
(() => {
    const host = document.getElementById('view-localmusic')?.parentElement;
    if (!host || document.getElementById('view-downloads')) return;
    const view = document.createElement('section');
    view.id = 'view-downloads';
    view.className = 'downloads-view hidden opacity-0';
    view.setAttribute('aria-label', '下载管理');
    const actions = [
        ['pauseAll', 'fa-pause', '全部暂停'], ['resumeAll', 'fa-play', '全部继续'],
        ['retryAllFailed', 'fa-redo', '全部重试'], ['retryAllLyrics', 'fa-file-audio', '补全歌词'],
        ['clearCompleted', 'fa-broom', '清空已完成'], ['clearAll', 'fa-trash', '清空全部']
    ];
    view.innerHTML = '<header class="downloads-heading"><div class="downloads-title"><h2>下载管理</h2><p id="download-global-speed">0 B/s · 0 项任务</p></div><div class="downloads-total">总进度 <strong id="download-progress-text">0%</strong></div></header>'
        + '<div class="downloads-toolbar">' + actions.map(([action, icon, label]) => '<button type="button" data-download-action="' + action + '"><i class="fas ' + icon + '" aria-hidden="true"></i>' + label + '</button>').join('') + '</div>'
        + '<div class="downloads-columns" aria-hidden="true"><span>歌曲</span><span>下载位置</span><span>音质</span><span>进度 / 状态</span><span>操作</span></div><div id="download-list-container" class="downloads-list custom-scrollbar" aria-live="polite"></div>';
    view.querySelector('.downloads-toolbar').addEventListener('click', event => {
        const action = event.target.closest('[data-download-action]')?.dataset.downloadAction;
        if (action && actions.some(item => item[0] === action)) window.SystemDownloadManager?.[action]();
    });
    host.appendChild(view);
})();
