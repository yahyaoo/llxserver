/** 全局配置镜像兼容和 SQL 主数据读取测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createAdminRepository } = require('../server/admin/repository/AdminRepository')
const { GlobalConfigurationService } = require('../server/admin/service/GlobalConfigurationService')

test('配置从 SQL 读取；外部镜像变化才重新解析，删除镜像不丢当前配置', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-config-unit-'))
  const filename = path.join(root, 'config.js')
  const repository = createAdminRepository(root)
  const service = new GlobalConfigurationService(repository)
  let parses = 0
  const parse = () => { parses++; return { port: parses === 1 ? 1234 : 5678, users: [] } }
  try {
    fs.writeFileSync(filename, 'legacy')
    assert.equal(service.load(filename, parse).port, 1234)
    assert.equal(service.load(filename, parse).port, 1234)
    assert.equal(parses, 1)
    fs.writeFileSync(filename, 'external-edit')
    assert.equal(service.load(filename, parse).port, 5678)
    assert.equal(parses, 2)
    fs.unlinkSync(filename)
    assert.equal(service.load(filename, () => { throw new Error('禁止回读') }).port, 5678)
  } finally { repository.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
