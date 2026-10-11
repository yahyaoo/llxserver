/** 账号会话存储及访问检查，禁止使用保存的密码自动登录。 */
(() => {
    const keys = ['lx_user_token', 'lx_user_expires_at', 'lx_remember_me'];
    const getToken = () => sessionStorage.getItem('lx_user_token') || localStorage.getItem('lx_user_token');
    const clear = () => {
        keys.forEach(key => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
        localStorage.removeItem('lx_sync_pass');
        localStorage.removeItem('lx_sync_user');
    };
    const save = data => {
        clear();
        const storage = data.rememberMe ? localStorage : sessionStorage;
        storage.setItem('lx_user_token', data.token);
        storage.setItem('lx_user_expires_at', String(data.expiresAt));
        storage.setItem('lx_remember_me', String(!!data.rememberMe));
        localStorage.setItem('lx_sync_user', data.username);
        // HTTP 歌单客户端也适用于经过代理的远程服务器。
        localStorage.setItem('lx_sync_mode', 'local');
    };
    const loginUrl = () => new URL('login', document.baseURI).href;
    const redirect = () => { clear(); window.location.replace(loginUrl()); };
    let expiryTimer;
    const scheduleExpiry = expiresAt => {
        clearTimeout(expiryTimer);
        if (!Number.isFinite(expiresAt)) return;
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) { redirect(); return; }
        expiryTimer = setTimeout(() => remaining > 2147483647 ? scheduleExpiry(expiresAt) : redirect(), Math.min(remaining, 2147483647));
    };
    const verify = async () => {
        const token = getToken();
        const response = await fetch('/api/user/auth/verify', { headers: token ? { 'x-user-token': token } : {}, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.valid) return null;
        if (data.token) save(data);
        if (document.documentElement.dataset.accountPage !== 'login') scheduleExpiry(data.expiresAt);
        return data;
    };
    window.AccountSession = { getToken, save, clear, verify, loginUrl, redirect };
    if (document.documentElement.dataset.accountPage === 'login') return;
    document.documentElement.style.visibility = 'hidden';
    window.accountReady = verify().then(data => {
        if (!data) { redirect(); return null; }
        localStorage.setItem('lx_sync_user', data.username);
        document.documentElement.style.visibility = '';
        return data;
    }).catch(() => { redirect(); return null; });
    window.addEventListener('pageshow', event => { if (event.persisted) verify().then(data => { if (!data) redirect(); }).catch(redirect); });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
        const response = await originalFetch(input, options);
        const url = typeof input === 'string' ? input : input.url;
        if (response.status === 401 && /\/api\/(music|user)\//.test(url) && !url.includes('/auth/verify') && !url.endsWith('/login')) redirect();
        return response;
    };
})();
