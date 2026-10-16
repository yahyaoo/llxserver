/* 固定行高虚拟窗口：只维护可视区与有限 overscan，数据仍由调用方完整持有。 */
(() => {
  const create = (container, options) => {
    const state = { count: Math.max(0, options.count || 0), rowHeight: Math.max(1, options.rowHeight || 1), overscan: Math.max(0, options.overscan ?? 4), nodes: new Map(), raf: 0, destroyed: false }
    const spacer = document.createElement('div'); spacer.className = 'vl-spacer'; const windowEl = document.createElement('div'); windowEl.className = 'vl-window'; spacer.append(windowEl); container.replaceChildren(spacer)
    const render = () => {
      state.raf = 0; if (state.destroyed) return
      const parent = options.scrollParent || container; const top = parent === container ? container.scrollTop : Math.max(0, parent.scrollTop - (container.offsetTop || 0)); const height = parent.clientHeight || container.clientHeight || 1
      const first = Math.max(0, Math.floor(top / state.rowHeight) - state.overscan); const last = Math.min(state.count, Math.ceil((top + height) / state.rowHeight) + state.overscan)
      spacer.style.height = `${state.count * state.rowHeight}px`; windowEl.style.transform = `translateY(${first * state.rowHeight}px)`
      const wanted = new Map(); for (let index = first; index < last; index++) { const key = options.key ? options.key(index) : String(index); let node = state.nodes.get(key); if (!node) node = options.render(index); if (!node) continue; node.dataset.index = String(index); wanted.set(key, node) }
      state.nodes.forEach((node, key) => { if (!wanted.has(key)) node.remove() }); state.nodes = wanted; const fragment = document.createDocumentFragment(); wanted.forEach(node => fragment.append(node)); windowEl.replaceChildren(fragment)
    }
    const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(render) }
    const onScroll = () => schedule(); container.addEventListener('scroll', onScroll, { passive: true }); options.scrollParent?.addEventListener('scroll', onScroll, { passive: true })
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null; resize?.observe(container); render()
    return { update(count = state.count) { state.count = Math.max(0, count); schedule() }, scrollToIndex(index, align = 'start') { const target = Math.max(0, Math.min(state.count - 1, index)) * state.rowHeight; const height = (options.scrollParent || container).clientHeight || container.clientHeight; (options.scrollParent || container).scrollTop = align === 'center' ? Math.max(0, target - (height - state.rowHeight) / 2) : target; schedule() }, refreshRow(index) { const key = options.key ? options.key(index) : String(index); state.nodes.delete(key); schedule() }, destroy() { state.destroyed = true; cancelAnimationFrame(state.raf); container.removeEventListener('scroll', onScroll); options.scrollParent?.removeEventListener('scroll', onScroll); resize?.disconnect(); state.nodes.clear(); container.replaceChildren() } }
  }
  window.VirtualList = { create }
})()
