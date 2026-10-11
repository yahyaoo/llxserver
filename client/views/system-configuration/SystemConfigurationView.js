/**
 * 后台系统设置工作区：分组导航、缺失字段和旧配置导入。
 * 保留原配置控件和保存流程，切换分组不重建节点、不丢失草稿。
 * @author yahyaoo
 */
window.SystemConfigurationView = class SystemConfigurationView {
    /** @param {HTMLElement} container 设置容器。 @param {Object} app 现有管理应用。 */
    constructor(container, app) {
        this.app = app;
        this.container = container;
        this.form = container.querySelector('#config-form');
        this.cards = new Map();
        this.buttons = new Map();
        this.fields = [];
        this.mount();
    }

    /** 挂载目录并移动现有表单节点，保留现有事件和控件状态。 */
    mount() {
        this.container.classList.add('system-settings');
        const layout = document.createElement('div');
        layout.className = 'system-settings-layout';
        this.navigation = document.createElement('nav');
        this.navigation.className = 'system-settings-navigation glass';
        this.navigation.setAttribute('aria-label', '系统设置目录');
        this.form.querySelectorAll(':scope > .config-card').forEach((card, index) => {
            const title = card.querySelector('.config-card-title').textContent.trim();
            card.id ||= `system-config-panel-${index}`;
            this.cards.set(title, card);
        });
        const storage = document.createElement('section');
        storage.className = 'config-card glass';
        storage.id = 'system-config-database';
        storage.innerHTML = '<div class="config-card-header"><div><h3 class="config-card-title">数据库与迁移</h3><p class="config-card-desc">管理库与播放库独立存储，修改路径后保存配置完成迁移。</p></div></div><div class="config-card-body"><p class="config-hint">填写完整文件路径或基于数据目录的相对路径。目标不存在时复制当前库并初始化；已有同类数据库校验成功后直接使用，保留其中数据。引导路径只保存到 config.js。</p><div class="config-field"><label class="config-label" for="database-admin-path">管理库文件路径</label><input class="form-input config-input" id="database-admin-path" name="database.adminPath" type="text" required></div><div class="config-field"><label class="config-label" for="database-music-path">播放库文件路径</label><input class="form-input config-input" id="database-music-path" name="database.musicPath" type="text" required></div><div class="config-divider"></div><h4>导入旧配置（config.js）</h4><p class="config-hint">覆盖文件中提供的业务配置；未提供的项保留。用户列表存在时一并导入。导入不会修改数据库路径，启动期配置需重启服务。</p><input id="legacy-system-config-file" type="file" accept=".js,.json" aria-label="选择旧配置文件"><button class="btn-secondary" type="button" id="legacy-system-config-import">导入旧配置</button><p id="legacy-system-config-result" class="config-hint" role="status" aria-live="polite"></p></div>';
        this.form.insertBefore(storage, this.form.querySelector('.config-actions-bar'));
        this.cards.set('数据库与迁移', storage);
        storage.querySelector('#legacy-system-config-import').addEventListener('click', () => this.importLegacy());
        const groups = [
            { label: '服务与访问', items: ['基本配置', '代理配置', '前端访问配置', '用户路径配置', '访问路径配置'] },
            { label: '音乐与缓存', items: ['自定义歌曲目录', '服务器下载配置', '权限与缓存限制', 'Subsonic 协议配置'] },
            { label: '同步与数据', items: ['WebDAV 同步配置', '备份与恢复', '数据库与迁移', '版本更新'] },
        ];
        groups.forEach(group => {
            const section = document.createElement('section');
            section.className = 'system-settings-group';
            const heading = document.createElement('h3');
            heading.textContent = group.label;
            section.appendChild(heading);
            group.items.forEach(title => {
                if (!this.cards.has(title)) return;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'system-settings-item';
                const icon = document.createElement('span');
                icon.className = 'system-settings-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4v16M9 10h11"/></svg>';
                const label = document.createElement('span');
                label.textContent = title;
                button.append(icon, label);
                button.setAttribute('aria-controls', this.cards.get(title).id);
                button.addEventListener('click', () => this.select(title));
                this.buttons.set(title, button);
                section.appendChild(button);
            });
            this.navigation.appendChild(section);
        });
        layout.append(this.navigation, this.form);
        this.container.appendChild(layout);
        this.select('基本配置');
    }

    /** @param {string} title 分组名称。仅切换显示，未知分组保持当前页面。 */
    select(title) {
        if (!this.cards.has(title)) return;
        this.cards.forEach((card, name) => { card.hidden = name !== title; });
        this.buttons.forEach((button, name) => {
            button.classList.toggle('is-active', name === title);
            button.setAttribute('aria-current', name === title ? 'page' : 'false');
        });
        this.active = title;
    }

    /** @param {Object} config 服务端配置，包含新增字段元数据。 */
    load(config) {
        this.fields = config.additionalFields || [];
        this.fields.forEach(field => {
            if (this.form.elements[field.key]) return;
            const card = this.cards.get(field.group);
            if (!card) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'config-field';
            const label = document.createElement('label');
            label.className = 'config-label';
            label.textContent = field.label;
            const control = document.createElement(field.type === 'select' ? 'select' : 'input');
            control.name = field.key;
            control.id = 'system-extra-' + field.key.replace(/\./g, '-');
            label.htmlFor = control.id;
            if (field.type === 'select') field.options.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value; control.appendChild(option); });
            else control.type = field.type;
            if (field.type !== 'checkbox') control.className = 'form-input config-input';
            if (field.min !== undefined) control.min = field.min;
            if (field.max !== undefined) control.max = field.max;
            const hint = document.createElement('small');
            hint.className = 'config-hint';
            hint.textContent = field.hint;
            wrapper.append(label, control, hint);
            card.querySelector('.config-card-body').appendChild(wrapper);
        });
        [...this.fields.map(field => field.key), 'database.adminPath', 'database.musicPath'].forEach(key => {
            const control = this.form.elements[key];
            if (!control) return;
            if (control.type === 'checkbox') control.checked = config[key] === true;
            else control.value = config[key] ?? '';
        });
    }

    /** @returns {Object} 新增字段和引导路径，提交到现有保存接口。 */
    values() {
        const result = {};
        [...this.fields.map(field => field.key), 'database.adminPath', 'database.musicPath'].forEach(key => {
            const control = this.form.elements[key];
            if (!control) return;
            result[key] = control.type === 'checkbox' ? control.checked : control.type === 'number' ? Number(control.value) : control.value.trim();
        });
        return result;
    }

    /** 读取选择文件并显式导入；失败不清空编辑内容、不刷新页面。 */
    async importLegacy() {
        const file = this.container.querySelector('#legacy-system-config-file').files[0];
        const status = this.container.querySelector('#legacy-system-config-result');
        const button = this.container.querySelector('#legacy-system-config-import');
        if (!file) { status.textContent = '请选择旧 config.js 文件'; return; }
        if (file.size > 2 * 1024 * 1024) { status.textContent = '配置文件不能超过 2 MB'; return; }
        button.disabled = true;
        status.textContent = '正在导入配置…';
        try {
            const result = await this.app.request('/api/config/import', { method: 'POST', body: JSON.stringify({ content: await file.text() }) });
            status.textContent = `已导入 ${result.imported} 项配置。启动期配置需重启；若管理密码已改变，请用新密码重新登录。`;
            if (result.authenticationChanged) {
                // logout 会刷新页面，提示暂存到当前浏览器会话，登录页初始化后再显示。
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('lx_configuration_import_notice', '配置导入成功，管理密码已改变，请使用新密码登录。');
                this.app.logout();
            } else await this.app.loadConfig();
        } catch (error) { status.textContent = '导入失败：' + error.message; }
        finally { button.disabled = false; }
    }
};
