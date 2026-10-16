/** 固定原路由语句基线，不依赖运行时 Git 分支。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const acorn = require('acorn')
const routes = require('./fixtures/route-refactor.json')

function digest(body) {
  const tokens = [...acorn.tokenizer('async function route() {' + body + '\n}', { ecmaVersion: 'latest' })].map(token => [token.type.label, token.value])
  tokens.forEach((token, i) => {
    if (token[0] === 'name' && token[1] === 'fs') token[1] = 'storageFs'
    if (token[0] === 'string' && tokens[i - 1]?.[0] === '(' && tokens[i - 2]?.[1] === 'require') token[1] = '<relocated-module>'
  })
  return crypto.createHash('sha256').update(JSON.stringify(tokens)).digest('hex')
}

test('未变更路由保持原执行语句，移除 WebDAV 后保留路由顺序', () => {
  assert.equal(routes.length, 160)
  const files = new Map()
  // Windows 检出可能使用 CRLF；统一换行，避免多行路由条件产生误报。
  const http = fs.readFileSync(path.join(__dirname, '../server/application/http/HttpServer.ts'), 'utf8').replace(/\r\n?/g, '\n')
  let position = 0
  const changed = new Set(['handleUsers','getStatus','getMusicCacheList','getMusicCacheDirectories','getMusicCustomList','postMusicCustomSync','handleMusicCustomFile','getMusicCustomCover','getMusicCustomEmbedLyric','getBackupDownload','postBackupUpload','getMusicDownloadCheck','getMusicDownload'])
  for (const route of routes.filter(route => !/Webdav/.test(route.method))) {
    const filename = path.join(__dirname, '..', route.file.replace(/^src\//, 'dist/server/').replace(/\.ts$/, '.js'))
    if (!files.has(filename)) {
      const source = fs.readFileSync(filename, 'utf8')
      files.set(filename, { source, tree: acorn.parse(source, { ecmaVersion: 'latest' }) })
    }
    const { source, tree } = files.get(filename)
    const handler = tree.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === route.method)
    assert.ok(handler, route.method)
    const statements = [...handler.body.body]
    while (statements[0]?.type === 'VariableDeclaration' && statements[0].declarations.length === 1 && ['context', 'runtime'].includes(statements[0].declarations[0].init?.name)) statements.shift()
    const body = statements.map(node => source.slice(node.start, node.end)).join('\n')
    // 配置持久化与备份还原单独验证；歌单基线已更新喜爱隔离及封面校验，其余路由保持原基线。作者：jingyh
    const changedConfigurationHandlers = ['handleConfig', 'postConfigBackupsRestore']
    if (!changed.has(route.method) && !(route.file === 'src/admin/service/ConfigurationService.ts' && changedConfigurationHandlers.includes(route.method))) assert.equal(digest(body), route.baselineDigest, route.file + ':' + route.method)
    const next = http.indexOf('if (' + route.condition + ')', position)
    assert.ok(next >= position, route.route + ' 条件顺序')
    position = next + 1
  }
})

test('自定义音源校验要求登录，音源操作归属使用已验证账号', async () => {
  require('tsx/cjs')
  const service = require('../server/admin/service/SourceService.ts')
  const previous = global.lx
  global.lx = { config: { 'frontend.password': 'admin-test', 'user.enablePublicRestriction': false } }
  let username = null, status, body, validated = 0
  const owners = []
  const handlers = { handleValidate() { validated++ } }
  for (const name of ['Import', 'Upload', 'List', 'Toggle', 'Delete', 'Reorder', 'UpdatePlatforms']) handlers['handle' + name] = (req, res, owner) => owners.push(owner)
  const context = { req: { headers: {} }, res: { writeHead(value) { status = value }, end(value) { body = JSON.parse(value) } }, urlObj: new URL('http://local/api/custom-source/list?username=bob') }
  const runtime = { customSourceHandlers: handlers, verifyUserAuth: () => username }
  try {
    await service.postCustomSourceValidate(context, runtime)
    assert.equal(status, 401); assert.equal(body.valid, false); assert.equal(validated, 0)
    username = 'alice'; await service.postCustomSourceValidate(context, runtime)
    assert.equal(validated, 1)
    username = null; context.req.headers['x-frontend-auth'] = 'admin-test'
    await service.postCustomSourceValidate(context, runtime); assert.equal(validated, 2)
    username = 'alice'
    for (const name of ['postCustomSourceImport', 'postCustomSourceUpload', 'getCustomSourceList', 'postCustomSourceToggle', 'postCustomSourceDelete', 'postCustomSourceReorder', 'postCustomSourceUpdatePlatforms']) await service[name](context, runtime)
    assert.deepEqual(owners, Array(7).fill('alice'), '请求中的 bob 不能覆盖已验证的 alice')
  } finally { global.lx = previous }
})

test('管理和播放器业务域不直接导入彼此，业务不导入 SDK 内部文件', () => {
  const root = path.join(__dirname, '../server')
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
  }
  for (const domain of ['admin', 'music']) {
    const other = domain === 'admin' ? 'music' : 'admin'
    for (const filename of walk(path.join(root, domain)).filter(name => name.endsWith('.ts'))) {
      const source = fs.readFileSync(filename, 'utf8')
      const imports = [...source.matchAll(/(?:from\s*|require\()(['"])([^'"]+)\1/g)].map(match => match[2])
      for (const target of imports) {
        const resolved = path.resolve(path.dirname(filename), target)
        assert.ok(!resolved.startsWith(path.join(root, other) + path.sep), filename + ' 跨域依赖')
        assert.ok(!target.includes('/integrations/music-sdk/internal/'), filename + ' SDK 内部依赖')
      }
    }
  }
})
