/** 手机导航和平台标签的行为回归，执行真实源码函数。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), acorn = require('acorn');
function loadFunction(file, name, globals = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const tree = acorn.parse(source, { ecmaVersion: 'latest' });
    let declaration;
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && node.id.name === name) declaration = node;
        Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : visit(value));
    };
    visit(tree); assert.ok(declaration, name);
    const context = vm.createContext(globals);
    vm.runInContext(source.slice(declaration.start, declaration.end), context);
    return context[name];
}
test('在线搜索、收藏和各业务页在手机导航中正确归类', () => {
    const target = loadFunction('client/music/views/mobile-shell/MobileShell.js', 'navigationTarget');
    assert.equal(target('search', 'network'), 'search');
    for (const scope of ['local_list', 'library', 'artist', 'album']) assert.equal(target('search', scope), 'mobile-library');
    for (const page of ['downloads', 'songlist', 'recent', 'leaderboard', 'localmusic']) assert.equal(target(page, 'network'), 'mobile-library');
    assert.equal(target('settings', 'network'), 'mobile-settings');
    assert.equal(target('mobile-settings', 'network'), 'mobile-settings');
    assert.equal(target('mobile-home', 'network'), 'mobile-home');
});
test('来源标记保留平台信息，QQ 和无损使用不同标签颜色', () => {
    const source = loadFunction('client/music/app.js', 'getSourceTag');
    const quality = loadFunction('client/music/app.js', 'getQualityTags', { window: {} });
    assert.match(source('tx'), /data-source="tx".*t-badge-green/);
    assert.match(source('kg'), /data-source="kg".*t-badge-blue/);
    assert.match(quality({ quality: 'flac' }), /data-quality="flac".*t-badge-blue/);
    assert.equal(quality({}), '');
    assert.match(source('unknown'), /data-source="other"/);
});
