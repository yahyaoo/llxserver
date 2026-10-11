/** 验证排行榜页面资源和原榜单 HTTP 接口。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { startLeaderboardRuntime } = require('./helpers/leaderboardRuntime.cjs')

test('真实 HTTP：独立排行榜页面资源、榜单切换及歌曲响应保留原接口', { timeout: 30000 }, async () => {
  const runtime = await startLeaderboardRuntime()
  try {
    const get = async url => {
      const response = await fetch(runtime.origin + url, { headers: runtime.headers })
      assert.equal(response.status, 200, url)
      return response
    }
    const html = await (await get('/')).text()
    assert.ok(html.includes('views/leaderboard/LeaderboardView.js'))
    assert.ok(html.includes('views/leaderboard/components/LeaderboardNavigation.js'))
    assert.ok(html.includes('css/page-surfaces.css'))
    assert.ok(html.includes('css/interactions.css'))
    assert.ok(html.includes('views/player-detail/appearance.css'))
    assert.ok(html.includes('css/popovers.css'))
    assert.ok(html.includes('views/settings/SettingsToggle.js'))
    for (const url of ['/views/leaderboard/LeaderboardView.js', '/views/leaderboard/components/LeaderboardNavigation.js', '/views/leaderboard/leaderboard.css', '/css/page-surfaces.css', '/css/interactions.css', '/views/player-detail/appearance.css']) {
      assert.ok((await (await get(url)).text()).length > 100)
    }
    for (const url of ['/css/popovers.css', '/views/settings/SettingsToggle.js']) {
      assert.ok((await (await get(url)).text()).length > 100)
    }
    // 验证真实服务提供新增选项；绘制效果与设置保存由浏览器测试覆盖。作者：jingyh
    const settingsView = await (await get('/views/settings/SettingsView.js')).text()
    for (const value of ['theme', 'artist', 'blur', 'solid', 'dark', 'spectrum', 'pulse', 'dots', 'flower']) {
      assert.ok(settingsView.includes('value="' + value + '"'), value)
    }
    for (const source of ['wy', 'tx']) {
      const boards = await (await get('/api/music/leaderboard/boards?source=' + source)).json()
      assert.equal(boards.list.length, 45)
      for (const board of [boards.list[0], boards.list.at(-1)]) {
        const songs = await (await get(`/api/music/leaderboard/list?source=${source}&bangid=${board.bangid}&page=1`)).json()
        assert.equal(songs.total, 80)
        assert.equal(songs.list.length, 80)
        assert.equal(songs.list[0].source, source)
        assert.ok(songs.list[0].songmid.startsWith(board.bangid))
      }
    }
    assert.equal((await fetch(runtime.origin + '/api/music/leaderboard/list?source=wy', { headers: runtime.headers })).status, 400)
  } finally { await runtime.stop() }
})
