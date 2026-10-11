/** 账号资料与修改密码界面，设置页和弹窗共用认证请求。 @author jingyh @date 2026-10-11 */
(() => {
    let avatarUrl;
    const renderAvatar = (container, url) => {
        if (!container) return;
        container.replaceChildren();
        if (url) { const image = document.createElement('img'); image.src = url; image.alt = '账号头像'; image.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%'; container.append(image); }
        else { const icon = document.createElement('i'); icon.className = 'fas fa-user'; container.append(icon); }
    };
    const request = async (url, options = {}) => {
        const response = await fetch(url, { ...options, headers: { ...window.getUserAuthHeaders(), ...options.headers } });
        const body = await response.text();
        let result;
        try { result = JSON.parse(body); } catch { throw new Error(response.status === 404 ? '当前服务端未提供账号接口，请更新服务端后重试' : '服务端响应异常（HTTP ' + response.status + '）'); }
        if (!response.ok) throw new Error(result.message || '操作失败');
        return result;
    };
    const update = async profile => {
        document.getElementById('account-username').value = profile.username;
        document.getElementById('account-nickname').value = profile.nickname || profile.username;
        window.accountProfileNickname = profile.nickname || profile.username;
        document.getElementById('header-username').textContent = profile.nickname || profile.username;
        if (avatarUrl) URL.revokeObjectURL(avatarUrl);
        avatarUrl = null;
        if (profile.avatar) {
            const response = await fetch(profile.avatar, { headers: window.getUserAuthHeaders() });
            if (response.ok) avatarUrl = URL.createObjectURL(await response.blob());
        }
        renderAvatar(document.getElementById('account-avatar-preview'), avatarUrl);
        renderAvatar(document.querySelector('#header-account-trigger .header-avatar'), avatarUrl);
    };
    window.loadAccountProfile = async () => {
        try { await update(await request('/api/user/account')); }
        catch (error) { document.getElementById('account-profile-status').textContent = error.message; }
    };
    window.openAccountSettings = async password => {
        if (password) { window.openAccountPasswordDialog(); return; }
        switchTab('settings'); selectSettingsSection('account');
    };
    let passwordDialog, passwordReturnFocus;
    /** 打开独立改密弹窗，不切换页面；原生对话框管理遮罩、焦点和 Esc。 @author jingyh */
    window.openAccountPasswordDialog = () => {
        passwordReturnFocus = document.getElementById('header-account-trigger');
        if (!passwordDialog) {
            passwordDialog = document.createElement('dialog');
            passwordDialog.id = 'account-password-dialog';
            passwordDialog.className = 'account-password-dialog';
            passwordDialog.setAttribute('aria-labelledby', 'account-password-dialog-title');
            passwordDialog.innerHTML = `<div class="account-dialog-heading"><div><h2 id="account-password-dialog-title">修改密码</h2><p>修改后需重新登录</p></div><button type="button" class="account-dialog-close" aria-label="关闭修改密码" onclick="closeAccountPasswordDialog()"><i class="fas fa-times"></i></button></div>
                <form id="account-modal-password-form" onsubmit="changeAccountPassword(event, 'account-modal')">
                    <label class="settings-field">原密码<input class="settings-text-input" id="account-modal-current-password" type="password" autocomplete="current-password" required></label>
                    <label class="settings-field">新密码<input class="settings-text-input" id="account-modal-new-password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required><small class="account-field-hint">6–128 位字符</small></label>
                    <label class="settings-field">确认新密码<input class="settings-text-input" id="account-modal-confirm-password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required></label>
                    <p id="account-modal-password-status" role="status" aria-live="polite"></p>
                    <div class="account-dialog-actions"><button type="button" class="settings-action settings-action-secondary" onclick="closeAccountPasswordDialog()">取消</button><button type="submit" class="settings-action">确认修改</button></div>
                </form>`;
            passwordDialog.addEventListener('close', () => {
                document.getElementById('account-modal-password-form').reset();
                document.getElementById('account-modal-password-status').textContent = '';
                passwordReturnFocus?.focus();
            });
            document.body.appendChild(passwordDialog);
        }
        if (!passwordDialog.open) passwordDialog.showModal();
        document.getElementById('account-modal-current-password').focus();
    };
    /** 关闭弹窗时清空密码，不在浏览器存储中保留密码。 @author jingyh */
    window.closeAccountPasswordDialog = () => passwordDialog?.close();
    window.saveAccountProfile = async event => {
        event.preventDefault(); const button = event.submitter; if (button) button.disabled = true;
        try { await update(await request('/api/user/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: document.getElementById('account-nickname').value }) })); document.getElementById('account-profile-status').textContent = '用户名已保存'; }
        catch (error) { document.getElementById('account-profile-status').textContent = error.message; }
        finally { if (button) button.disabled = false; }
    };
    window.uploadAccountAvatar = async input => {
        const file = input.files[0]; if (!file) return;
        try { if (file.size > 2 * 1024 * 1024) throw new Error('头像不能超过 2 MB'); const cropped = await window.AvatarCropper.edit(file); if (!cropped) return; await update(await request('/api/user/account/avatar', { method: 'POST', body: cropped })); document.getElementById('account-profile-status').textContent = '头像已更新'; }
        catch (error) { document.getElementById('account-profile-status').textContent = error.message; }
        finally { input.value = ''; }
    };
    /** 两个表单使用各自字段与错误提示，成功后沿用账号退出流程。 @author jingyh */
    window.changeAccountPassword = async (event, prefix = 'account') => {
        event.preventDefault(); const status = document.getElementById(prefix + '-password-status');
        const password = document.getElementById(prefix + '-new-password').value;
        if (password !== document.getElementById(prefix + '-confirm-password').value) { status.textContent = '两次输入的新密码不一致'; return; }
        const button = event.submitter; if (button) button.disabled = true;
        try { await request('/api/user/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: document.getElementById(prefix + '-current-password').value, newPassword: password }) }); document.getElementById(prefix + '-password-form').reset(); status.textContent = '密码已修改，请重新登录'; await handleSyncLogout(true); }
        catch (error) { status.textContent = error.message; }
        finally { if (button) button.disabled = false; }
    };
})();
