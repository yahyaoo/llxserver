/** 设置章节共用卡片与标题，移动已有节点而不重建表单。 @author jingyh @date 2026-10-11 */
(() => {
    const sections = {
        sources: ['源与基础设置', '配置音乐来源、音质与基础播放选项。', 'fa-server'],
        network: ['网络设置', '管理播放与下载代理、自定义代理地址和缓存并发量。', 'fa-globe'],
        updates: ['版本更新', '配置版本检查服务及访问凭证。', 'fa-arrow-circle-up'],
        'auto-update': ['自动更新', '管理网络歌单检测、自动同步与账号设置保存。', 'fa-sync-alt'],
        cache: ['本地缓存与重置', '配置缓存策略、存储位置与清理操作。', 'fa-database'],
        'configuration-import': ['迁移洛雪配置', '将洛雪配置文件中的设置迁移到当前账号。', 'fa-file-import'],
        token: ['Token 配置', '管理当前账号的 API 访问凭证与有效期。', 'fa-key'],
        theme: ['主题与外观', '选择配色、外观模式、透明度和背景图片。', 'fa-palette'],
        layout: ['界面与布局', '调整歌词、页面布局和显示选项。', 'fa-desktop'],
        visuals: ['播放背景与视觉特效', '选择播放详情背景、动态效果与渲染风格。', 'fa-image'],
        queue: ['播放队列与列表', '配置队列外观、列表显示与播放顺序。', 'fa-list-ul'],
        playback: ['播放体验强化', '调整声音效果、切换体验和连续播放行为。', 'fa-headphones-alt'],
        recovery: ['播放失败处理策略', '配置重试、预读与播放恢复选项。', 'fa-shield-alt'],
        devices: ['系统交互与外设', '管理系统媒体控制、外设交互和后台播放。', 'fa-keyboard'],
        admin: ['后台管理', '在独立标签页管理服务器，保留当前音乐播放。', 'fa-server'],
        logs: ['系统日志', '查看当前客户端的运行信息和问题记录。', 'fa-terminal'],
        about: ['关于', '了解项目、使用说明和版本信息。', 'fa-info-circle'],
    };
    /** 使用独立图标块和两行文字，复用后台的标题层次。 */
    function heading(title, description, icon) {
        const header = document.createElement('div'); header.className = 'settings-card-header';
        const badge = document.createElement('span'); badge.className = 'settings-card-icon'; badge.setAttribute('aria-hidden', 'true');
        const glyph = document.createElement('i'); glyph.className = 'fas ' + icon; badge.append(glyph);
        const text = document.createElement('div'); text.className = 'settings-card-heading-text';
        const name = document.createElement('h3'); name.textContent = title;
        const detail = document.createElement('p'); detail.textContent = description;
        text.append(name, detail); header.append(badge, text); return header;
    }
    /** 内部小章节使用相同标题结构，原说明和所有控件节点保持不变。 */
    function decorateSubsections(container) {
        container.querySelectorAll('.settings-card-body h3').forEach(old => {
            if (old.closest('.settings-card-header')) return;
            const copy = old.cloneNode(true);
            copy.querySelectorAll('i,.setting-tooltip-trigger').forEach(node => node.remove());
            const title = copy.textContent.trim();
            const description = old.nextElementSibling?.matches('p') ? old.nextElementSibling : null;
            const details = description?.textContent.trim() || ({ '自定义源': '管理音乐源，按需启用和维护。', '最近播放': '管理当前账号的播放记录。' }[title] || '配置' + title + '的相关选项。');
            const icon = old.querySelector('i:not(.fa-question-circle)')?.className.match(/fa-[\w-]+/g)?.find(value => value !== 'fa-question-circle') || (/图片|背景/.test(title) ? 'fa-image' : /主题/.test(title) ? 'fa-palette' : 'fa-sliders-h');
            const header = heading(title, details, icon); header.classList.add('settings-subsection-header');
            old.replaceWith(header); description?.remove();
        });
    }
    /** 只在首次挂载组织卡片，目录切换与重复调用保留输入值、事件和滚动节点。 */
    function apply(container) {
        if (!container?.querySelectorAll) return;
        container.querySelectorAll('[data-settings-section]').forEach(section => {
            if (section.dataset.settingsCardMounted) return;
            section.dataset.settingsCardMounted = 'true';
            const id = section.dataset.settingsSection;
            if (id === 'account') {
                section.querySelectorAll('.account-card-heading').forEach(old => {
                    const title = old.closest('#account-password-section') ? '账号安全' : '账号资料';
                    const description = old.querySelector('p')?.textContent || '';
                    old.replaceWith(heading(title, description, title.includes('安全') ? 'fa-shield-alt' : 'fa-user'));
                });
                section.querySelectorAll('.account-settings-card').forEach(card => {
                    card.classList.add('settings-section-card');
                    const form = card.querySelector('form'); form.classList.add('settings-card-body');
                });
                return;
            }
            const metadata = sections[id]; if (!metadata) return;
            const first = section.firstElementChild;
            if (first?.matches('h3,h4')) first.remove();
            // 播放体验的最近播放卡片位于总标题之前，移除重复的总标题。
            Array.from(section.children).filter(node => node.matches('h3,h4')).forEach(node => node.remove());
            const card = document.createElement('div'); card.className = 'settings-form-card settings-section-card';
            const body = document.createElement('div'); body.className = 'settings-card-body';
            while (section.firstChild) body.append(section.firstChild);
            card.append(heading(...metadata), body); section.append(card);
            section.classList.remove('settings-form-card'); section.classList.add('settings-section-frame');
        });
        decorateSubsections(container);
    }
    window.SettingsCards = { apply, sections };
    apply(document.getElementById('view-settings'));
})();
