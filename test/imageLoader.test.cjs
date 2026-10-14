const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

test('图片加载器仅在进入视口后计算候选，清理后可重新观察', async () => {
  const source = fs.readFileSync('client/music/js/image_loader.js', 'utf8')
  let observer
  class IO { constructor(cb) { this.cb = cb; observer = this } observe() {} unobserve() {} disconnect() {} }
  const context = { window: {}, IntersectionObserver: IO }
  vm.runInNewContext(source, context)
  let resolved = 0; const image = { dataset: {}, removeAttribute() {}, set src(value) { this.value = value } }
  context.window.ImageLoader.observe(image, () => { resolved++; return [] }, { src: '/cover.jpg' })
  assert.equal(resolved, 0)
  observer.cb([{ target: image, isIntersecting: true }]); await Promise.resolve(); assert.equal(resolved, 1); assert.equal(image.value, '/cover.jpg')
  context.window.ImageLoader.clear(); context.window.ImageLoader.observe(image, () => { resolved++; return [] }, { src: '/cover2.jpg' })
  assert.equal(resolved, 1)
})

test('通用懒加载重复遇到图片时保留封面组件的候选解析器', async () => {
  const source = fs.readFileSync('client/music/js/image_loader.js', 'utf8')
  let observer, attached
  class IO { constructor(cb) { this.cb = cb; observer = this } observe() {} unobserve() {} disconnect() {} }
  const context = { window: { LibraryArtwork: { attach(image, candidates) { attached = candidates }, known: () => null } }, IntersectionObserver: IO }
  vm.runInNewContext(source, context)
  const image = { dataset: { src: '/first-cover.jpg' }, removeAttribute() {}, set src(value) { this.value = value } }
  context.window.ImageLoader.observe(image, () => ['/first-cover.jpg', '/public-artwork.jpg'], { src: image.dataset.src })
  context.window.ImageLoader.observe(image, () => [], { src: image.dataset.src, preserveResolver: true })
  observer.cb([{ target: image, isIntersecting: true }])
  await Promise.resolve()
  assert.deepEqual(attached, ['/first-cover.jpg', '/public-artwork.jpg'])
})
