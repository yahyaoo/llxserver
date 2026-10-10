/** 账号资料与修改密码界面，只读用户名与服务端认证结果保持一致。 */
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
        switchTab('settings'); selectSettingsSection('account');
        if (password) { document.getElementById('account-password-section').scrollIntoView({ block: 'center', behavior: 'smooth' }); document.getElementById('account-current-password').focus(); }
    };
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
    window.changeAccountPassword = async event => {
        event.preventDefault(); const status = document.getElementById('account-password-status');
        const password = document.getElementById('account-new-password').value;
        if (password !== document.getElementById('account-confirm-password').value) { status.textContent = '两次输入的新密码不一致'; return; }
        const button = event.submitter; if (button) button.disabled = true;
        try { await request('/api/user/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: document.getElementById('account-current-password').value, newPassword: password }) }); document.getElementById('account-password-form').reset(); status.textContent = '密码已修改，请重新登录'; await handleSyncLogout(true); }
        catch (error) { status.textContent = error.message; }
        finally { if (button) button.disabled = false; }
    };
})();
