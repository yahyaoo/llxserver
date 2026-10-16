const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

test('虚拟列表只渲染视口与 overscan 行并支持更新', () => {
  const source = fs.readFileSync('client/music/js/virtual_list.js', 'utf8')
  const callbacks = []
  const make = tag => ({ tag, dataset: {}, remove() { this.removed = true } })
  const container = { scrollTop: 0, clientHeight: 100, offsetTop: 0, replaceChildren(fragment) { this.children = fragment ? [...(fragment.nodes || [])] : [] }, addEventListener() {}, removeEventListener() {} }
  const context = { window: {}, document: { createElement: () => ({ className: '', style: {}, append(node) { this.nodes = [node] }, replaceChildren(fragment) { this.nodes = fragment ? [...(fragment.nodes || [])] : [] } }), createDocumentFragment: () => ({ nodes: [], append(node) { this.nodes.push(node) } }) }, requestAnimationFrame: fn => { callbacks.push(fn); return callbacks.length }, cancelAnimationFrame() {}, ResizeObserver: class { observe() {} disconnect() {} } }
  vm.runInNewContext(source, context)
  const list = context.window.VirtualList.create(container, { count: 100, rowHeight: 20, overscan: 1, render: index => make(index) })
  while (callbacks.length) callbacks.shift()()
  assert.ok(container.children.length <= 7)
  list.update(2); while (callbacks.length) callbacks.shift()()
  assert.ok(container.children.length <= 2)
  list.destroy(); assert.deepEqual(container.children, [])
})
