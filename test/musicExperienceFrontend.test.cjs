/** 外观控件保存的前端回归测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

test('旧服务端缺少模糊度时保留当前百分比，完整响应仍采用规范值', async () => {
  const controls = ['glassBlur', 'opacity'].map(key => ({ dataset: { experienceControl: key }, parentElement: { querySelector: () => outputs[key] } }))
  const outputs = { glassBlur: {}, opacity: {} }, styles = new Map(), cache = new Map()
  const root = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) }, classList: { add() {}, toggle() {} } }
  const preview = { style: {}, classList: { toggle() {} } }
  let reply = { theme: 'pink', appearance: 'system', opacity: 0.3 }
  const context = vm.createContext({ window: { getUserAuthHeaders: () => ({ 'x-user-name': 'alice', 'x-user-token': 'test' }), ThemeControls: { colors: [] } },
    document: { documentElement: root, querySelectorAll: () => controls, getElementById: () => preview, addEventListener() {} },
    localStorage: { setItem: (key, value) => cache.set(key, value) }, setTheme() {}, setAppearance() {}, URL,
    fetch: async () => ({ ok: true, json: async () => reply })
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/music_experience.js'), 'utf8'), context)
  for (const strength of [0, 50, 100]) {
    await context.window.MusicExperience.change({ glassBlur: strength })
    assert.equal(context.window.MusicExperience.value.glassBlur, strength)
    assert.equal(outputs.glassBlur.value, strength + '%')
    assert.equal(styles.get('--surface-blur'), strength * .4 + 'px')
    assert.equal(JSON.parse(cache.get('lx_experience:alice')).glassBlur, strength)
  }
  reply = { ...reply, glassBlur: 0 }
  await context.window.MusicExperience.change({ glassBlur: 75 })
  assert.equal(outputs.glassBlur.value, '0%', '服务端明确返回 0 时不使用回退值')
})
