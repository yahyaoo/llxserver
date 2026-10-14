/** 分页参数、排序、搜索、ETag 与最近播放分页单元测试。 */
require('tsx/cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parsePageQuery, pageItems, pageEtag } = require('../server/music/service/library/PagedListService.ts')
const experience = require('../server/music/service/ExperienceService.ts')
const items = [{ id: '1', name: ' 周杰伦 ', singer: 'Jay' }, { id: '2', name: '林俊杰', singer: 'JJ' }, { id: '3', name: '周深', singer: '深' }]

test('分页参数限制上限并拒绝非法排序', () => {
  const query = parsePageQuery(new URL('http://x/?offset=2&limit=999&q=%E5%91%A8&sort=name&order=asc'), { sorts: ['name'], sort: 'name', order: 'desc' })
  assert.deepEqual(query, { offset: 2, limit: 500, q: '周', sort: 'name', order: 'asc' })
  assert.throws(() => parsePageQuery(new URL('http://x/?sort=bad'), { sorts: ['name'], sort: 'name' }), error => error.statusCode === 400)
})

test('分页搜索、稳定排序和越界结果', () => {
  const query = parsePageQuery(new URL('http://x/?offset=0&limit=1&sort=name&order=asc&q=%E5%91%A8'), { sorts: ['name'], sort: 'name' })
  const result = pageItems(items, query, { text: item => `${item.name} ${item.singer}`, sort: { name: item => item.name }, id: item => item.id })
  assert.equal(result.total, 2); assert.equal(result.items.length, 1); assert.equal(result.items[0].id, '1')
  const empty = pageItems(items, { ...query, q: '', offset: 100 }, { text: item => item.name, sort: { name: item => item.name } })
  assert.equal(empty.total, 3); assert.deepEqual(empty.items, [])
})

test('精确页 ETag 区分分页查询', () => {
  const query = { offset: 0, limit: 2, q: '', sort: 'name', order: 'asc' }
  const result = pageItems(items, query, { text: item => item.name, sort: { name: item => item.name } })
  assert.notEqual(pageEtag('alice', 'list', query, result), pageEtag('alice', 'list', { ...query, offset: 2 }, result))
  assert.notEqual(pageEtag('alice', 'list', query, result), pageEtag('bob', 'list', query, result))
})

test('最近播放分页返回服务端 total 与当前页', () => {
  const repository = { read: (_table, name, fallback) => fallback }
  const query = { offset: 1, limit: 1, q: '', sort: 'time', order: 'desc' }
  assert.equal(typeof experience.getRecentPage, 'function')
  const result = experience.getRecentPage(repository, query)
  assert.equal(result.offset, 1); assert.deepEqual(result.items, [])
})
