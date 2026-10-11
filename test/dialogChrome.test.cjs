/** 统一弹框标题识别的行为回归。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), acorn = require('acorn');
const source = fs.readFileSync(path.join(__dirname, '../client/music/components/dialog/DialogChrome.js'), 'utf8');
const context = vm.createContext({});
function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && ['isCloseButton', 'findHeading'].includes(node.id.name)) {
        vm.runInContext(source.slice(node.start, node.end), context);
    }
    Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : visit(value));
}
visit(acorn.parse(source, { ecmaVersion: 'latest' }));
const close = { classList: { contains: () => false }, querySelector: () => ({}), getAttribute: () => null };
const action = { classList: { contains: () => false }, querySelector: () => null, getAttribute: () => null };
const node = (parentElement, buttons = []) => ({ parentElement, querySelectorAll: () => buttons });

test('睡眠定时和 Token 弹框选择嵌套标题栏，不将正文容器横排', () => {
    const panel = node(null), body = node(panel, [close, action]), header = node(body, [close]), title = node(header);
    assert.equal(context.findHeading(title, panel), header);
});
test('音源标题信息和原关闭按钮保留在同一标题栏', () => {
    const panel = node(null), header = node(panel, [close]), metadata = node(header), title = node(metadata);
    assert.equal(context.findHeading(title, panel), header);
});
test('没有关闭按钮时仅包装标题，不吞并表单和业务操作', () => {
    const panel = node(null), body = node(panel, [action]), title = node(body);
    assert.equal(context.findHeading(title, panel), title);
});
test('识别 Element 原关闭按钮与无障碍关闭标签，排除正文操作', () => {
    assert.ok(context.isCloseButton({ ...action, classList: { contains: name => name === 'el-message-box__headerbtn' } }));
    assert.ok(context.isCloseButton({ ...action, getAttribute: () => '关闭弹框' }));
    assert.ok(!context.isCloseButton(action));
});
