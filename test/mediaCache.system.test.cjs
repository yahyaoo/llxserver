/** 媒体缓存静态交付系统测试；真实 IDB/刷新需在浏览器环境继续验收。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startAccountRuntime } = require('./helpers/accountRuntime.cjs');

test('真实 HTTP 交付媒体缓存脚本和设置控件，源码不包含认证令牌', { timeout: 40000 }, async () => {
    const runtime = await startAccountRuntime();
    try {
        for (const path of ['/music/js/media_cache.js', '/music/js/media_cache_settings.js']) {
            const response = await fetch(runtime.origin + path);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type') || '', /javascript/);
            const source = await response.text();
            assert.match(source, /lx_music_media_cache|MediaCacheSettings/);
            assert.doesNotMatch(source, /x-user-token|authorization\s*[:=]/i);
        }
        const settingsView = fs.readFileSync(path.join(__dirname, '..', 'client/music/views/settings/SettingsView.js'), 'utf8');
        assert.match(settingsView, /setting-enable-cover-local-cache/);
        assert.match(settingsView, /data-media-cache-clear-(cover|lyrics|all)/);
    } finally { await runtime.stop(); }
});
