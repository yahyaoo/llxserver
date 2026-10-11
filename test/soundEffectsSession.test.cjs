/** 音效同步使用当前会话，避免依赖已移除的浏览器密码字段。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../client/music/js/sound-effects.js'), 'utf8');
const start = source.indexOf('    async function pushToServer(');
const end = source.indexOf('\n    function ', source.indexOf('    async function fetchFromServer(', start));

test('已登录会话无需保存密码即可保存和回读音效，未登录和远程模式不写入', async () => {
    let loggedIn = true, mode = 'local'; const requests = [], stored = new Map();
    const context = vm.createContext({ window: { settings: { saveAccountSettingsToFile: true }, isUserLoggedIn: () => loggedIn },
        localStorage: { getItem: key => key === 'lx_sync_mode' ? mode : null, setItem: (key, value) => stored.set(key, value) },
        settings: { eq: [0] }, customPresets: [], getUserAuthHeaders: () => ({ 'x-user-token': 'isolated-session' }),
        applySettings() {}, renderUI() {}, loadSettings() {}, console,
        fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ settings: { eq: [4] }, customPresets: [] }) }; },
    });
    vm.runInContext(source.slice(start, end), context);
    await context.pushToServer({ settings: { eq: [4] } });
    assert.equal(requests.length, 1); assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers['x-user-token'], 'isolated-session');
    await context.fetchFromServer();
    assert.equal(requests.length, 2); assert.equal(context.settings.eq[0], 4);
    assert.equal(JSON.parse(stored.get('lx_sound_effects')).settings.eq[0], 4);
    loggedIn = false; await context.pushToServer({}); await context.fetchFromServer();
    assert.equal(requests.length, 2);
    loggedIn = true; mode = 'remote'; await context.pushToServer({}); await context.fetchFromServer();
    assert.equal(requests.length, 2);
});
