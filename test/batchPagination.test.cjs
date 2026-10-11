/** 验证分页脚本先于应用加载时无异常，以及列表分页和网络续页行为。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../client/music/js/batch_pagination.js'), 'utf8');

/** @returns {object} 包含真实分页脚本、测试控件及渲染记录的隔离浏览器上下文。 */
function createContext() {
  const calls = { renders: [], scrolls: [], searches: [] };
  const controls = {
    'jump-page-input': { value: '1' },
    'search-btn-next': { innerHTML: '下一页', disabled: false },
    'search-results': { scrollTo: options => calls.scrolls.push(options.top) },
  };
  const context = vm.createContext({
    console, settings: { itemsPerPage: 2 }, currentPage: 1,
    viewingPlaylist: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
    document: { getElementById: id => controls[id] || null },
    renderResults: list => calls.renders.push(list),
    doSearch: (...args) => { calls.searches.push(args); },
    localStorage: { setItem() {} },
  });
  context.window = context;
  vm.runInContext(source, context);
  return { context, calls, controls };
}

test('批量分页脚本先于应用加载，不访问尚未定义的 goToPage，所有本模块入口可用', () => {
  const { context } = createContext();
  assert.equal(context.goToPage, undefined);
  for (const name of ['handleBatchSelect', 'toggleBatchMode', 'handleBatchCollect', 'nextPage', 'prevPage', 'jumpToPage', 'changeItemsPerPage']) {
    assert.equal(typeof context[name], 'function', name);
  }
  const page = fs.readFileSync(path.join(__dirname, '../client/music/index.html'), 'utf8');
  assert.ok(page.indexOf('src="js/batch_pagination.js"') < page.indexOf('src="app.js"'));
});

test('应用继续提供全局搜索分页入口，批量脚本不覆盖已有实现', () => {
  const { context, calls } = createContext();
  const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8');
  const start = app.indexOf('window.goToPage = function (page)');
  assert.ok(start >= 0);
  vm.runInContext(app.slice(start, app.indexOf('\n};', start) + 3), context);
  const original = context.goToPage;
  context.goToPage(3);
  assert.equal(context.currentPage, 3);
  assert.deepEqual(calls.searches, [[3]]);
  vm.runInContext(source, context);
  assert.equal(context.goToPage, original);
});

test('本地列表上一页、下一页、首页和末页保留页码及回到列表顶部的行为', async () => {
  const { context, calls } = createContext();
  await context.nextPage(); assert.equal(context.currentPage, 2);
  context.prevPage(); assert.equal(context.currentPage, 1);
  context.lastPage(); assert.equal(context.currentPage, 3);
  await context.nextPage(); assert.equal(context.currentPage, 3);
  context.firstPage(); assert.equal(context.currentPage, 1);
  context.prevPage(); assert.equal(context.currentPage, 1);
  assert.equal(calls.renders.length, 4);
  assert.deepEqual(calls.scrolls, [0, 0, 0, 0]);
});

test('跳页输入限制在有效页码，每页显示全部时仍为一页', () => {
  const { context, controls } = createContext();
  controls['jump-page-input'].value = '99'; context.jumpToPage(); assert.equal(context.currentPage, 3);
  controls['jump-page-input'].value = 'invalid'; context.jumpToPage(); assert.equal(context.currentPage, 1);
  context.settings.itemsPerPage = 'all';
  context.lastPage(); assert.equal(context.currentPage, 1);
});

test('网络列表末页请求下一批结果，失败后仍恢复按钮状态', async () => {
  const { context, controls, calls } = createContext();
  context.currentPage = 3; context.currentNetworkPage = 4; context.currentSearchScope = 'network';
  await context.nextPage();
  assert.deepEqual(calls.searches, [[5, true]]);
  context.doSearch = async () => { throw new Error('测试网络失败'); };
  await assert.rejects(context.nextPage(), /测试网络失败/);
  assert.equal(controls['search-btn-next'].innerHTML, '下一页');
  assert.equal(controls['search-btn-next'].disabled, false);
});
