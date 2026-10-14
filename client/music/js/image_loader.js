/* 真实视口图片门控与共享网络调度；只在进入视口后计算候选。 */
(() => {
  let records = new WeakMap()
  const roots = new Map()
  const queue = []
  let running = 0
  const maxConcurrent = 6

  const pump = () => {
    while (running < maxConcurrent && queue.length) {
      const task = queue.pop()
      if (task.cancelled) continue
      running++
      Promise.resolve().then(task.run).catch(() => {}).finally(() => { running--; pump() })
    }
  }
  const runResourceTask = (priority, signal, loader) => new Promise((resolve, reject) => {
    const task = { cancelled: false, run: async () => {
      if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      try { resolve(await loader(signal)) } catch (error) { reject(error); throw error }
    }}
    task.cancel = () => { task.cancelled = true; reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })) }
    if (priority === 'high') queue.unshift(task); else queue.push(task)
    pump()
    signal?.addEventListener('abort', task.cancel, { once: true })
  })

  const rootObserver = root => {
    if (roots.has(root)) return roots.get(root)
    if (typeof IntersectionObserver === 'undefined') return null
    const state = { observer: new IntersectionObserver(entries => entries.forEach(entry => {
      const record = records.get(entry.target)
      if (!record) return
      record.visible = entry.isIntersecting
      if (!entry.isIntersecting) { record.release?.(); return }
      if (record.started) return
      record.started = true
      const candidates = record.resolve?.() || []
      if (candidates.length && window.LibraryArtwork) window.LibraryArtwork.attach(entry.target, candidates)
      else if (record.src) {
        const src = record.src
        runResourceTask('normal', undefined, () => new Promise((resolve, reject) => {
          entry.target.onload = () => { entry.target.removeAttribute('data-src'); resolve() }
          entry.target.onerror = reject
          entry.target.src = src
        })).catch(() => { entry.target.src = '/music/assets/logo.svg' })
      }
    }), { root, rootMargin: '0px', threshold: 0.01 }), root }
    roots.set(root, state); return state
  }

  window.ImageLoader = {
    observe(image, resolve, options = {}) {
      // 通用懒加载可能在组件绑定之后再次遇到同一图片；保留组件提供的候选解析器。
      if (options.preserveResolver && records.get(image)?.resolve) return () => this.unobserve(image)
      const root = options.root || null
      const record = { resolve, src: options.src || image.dataset.src, started: false, visible: false, release: options.release }
      records.set(image, record)
      const known = window.LibraryArtwork?.known(record.src)
      if (known) { record.started = true; image.classList.remove('is-placeholder'); image.src = known; image.removeAttribute('data-src'); return () => this.unobserve(image) }
      const state = rootObserver(root)
      if (state) state.observer.observe(image)
      else { record.started = true; const candidates = resolve?.() || []; if (candidates.length) window.LibraryArtwork?.attach(image, candidates); else if (record.src) image.src = record.src }
      return () => this.unobserve(image)
    },
    unobserve(image) { const record = records.get(image); if (!record) return; record.release?.(); roots.forEach(state => state.observer.unobserve(image)); records.delete(image) },
    clear() { roots.forEach(state => state.observer.disconnect()); roots.clear(); records = new WeakMap() },
    runResourceTask,
  }
})()
