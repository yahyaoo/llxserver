/** 在隔离 DOM 中按真实页面顺序载入加载组件。 @author jingyh @date 2026-10-12 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = context => {
    context.document.querySelectorAll ||= () => [];
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../client/music/components/loading-state/index.js'), 'utf8'), context);
};
