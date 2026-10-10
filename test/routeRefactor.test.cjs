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

test('158 个非配置路由保持原执行语句，160 个原路由条件顺序保持一致', () => {
  assert.equal(routes.length, 160)
  const files = new Map()
  const http = fs.readFileSync(path.join(__dirname, '../src/application/http/HttpServer.ts'), 'utf8')
  let position = 0
  for (const route of routes) {
    const filename = path.join(__dirname, '..', route.file.replace(/^src\//, 'server/').replace(/\.ts$/, '.js'))
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
    // 本次需求明确修改配置持久化与配置备份还原；其余处理器继续固定原语句基线。
    const changedConfigurationHandlers = ['handleConfig', 'postConfigBackupsRestore']
    if (!(route.file === 'src/admin/service/ConfigurationService.ts' && changedConfigurationHandlers.includes(route.method))) assert.equal(digest(body), route.baselineDigest, route.file + ':' + route.method)
    const next = http.indexOf('if (' + route.condition + ')', position)
    assert.ok(next >= position, route.route + ' 条件顺序')
    position = next + 1
  }
})

test('管理和播放器业务域不直接导入彼此，业务不导入 SDK 内部文件', () => {
  const root = path.join(__dirname, '../src')
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
