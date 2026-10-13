/** 统一本地和远程账号登录入口。 */
(() => {
    let remote = false;
    const field = document.getElementById('remote-server-field');
    const server = document.getElementById('server-url');
    const error = document.getElementById('auth-error');
    const button = document.getElementById('submit-btn');
    const choose = value => {
        remote = value; field.hidden = !remote; server.required = remote;
        document.getElementById('login-local').setAttribute('aria-pressed', String(!remote));
        document.getElementById('login-remote').setAttribute('aria-pressed', String(remote));
        document.getElementById('server-description').textContent = remote ? '登录指定服务器，并使用该服务器的音乐与账号数据' : '使用当前客户端绑定的服务器';
        error.hidden = true;
    };
    document.getElementById('login-local').onclick = () => choose(false);
    document.getElementById('login-remote').onclick = () => choose(true);
    // 密码从不写入浏览器存储。
    server.value = localStorage.getItem('lx_login_server') || '';
    if (server.value) choose(true);
    document.getElementById('account-login-form').addEventListener('submit', async event => {
        event.preventDefault(); error.hidden = true; button.disabled = true; button.textContent = '正在登录…';
        const passwordInput = document.getElementById('auth-password-input');
        try {
            const response = await fetch('/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('auth-username-input').value.trim(), password: passwordInput.value, rememberMe: document.getElementById('remember-me').checked, ...(remote ? { serverUrl: server.value.trim() } : {}) }) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || '登录失败');
            window.AccountSession.save(result);
            localStorage.removeItem('lx_admin_password');
            for (const key of ['lx_sync_url', 'lx_sync_code', 'lx_ws_auth']) localStorage.removeItem(key);
            if (remote) localStorage.setItem('lx_login_server', server.value.trim()); else localStorage.removeItem('lx_login_server');
            button.textContent = '正在加载账号数据…';
            await window.ClientData.bootstrap();
            passwordInput.value = '';
            window.location.replace(new URL('./', document.baseURI).href);
        } catch (failure) { error.textContent = failure.message || '网络连接失败，请稍后重试'; error.hidden = false; passwordInput.value = ''; passwordInput.focus(); }
        finally { button.disabled = false; button.textContent = '登录'; }
    });
    window.AccountSession.verify().then(async data => { if (data) { await window.ClientData.bootstrap(); window.location.replace(new URL('./', document.baseURI).href); } }).catch(() => {});
})();
