import crypto from 'node:crypto'

export interface PageQuery {
  offset: number
  limit: number
  q: string
  sort: string
  order: 'asc' | 'desc'
}

export interface PageResult<T> {
  total: number
  offset: number
  limit: number
  version: string
  items: T[]
}

const SORT_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/

/** 解析只读分页参数，拒绝模糊数字和未知排序字段。 */
export function parsePageQuery(url: URL, defaults: { sort: string; order?: 'asc' | 'desc'; sorts: string[] }): PageQuery {
  const readInt = (name: string, fallback: number, max?: number) => {
    const value = url.searchParams.get(name)
    if (value == null) return fallback
    if (!/^\d+$/.test(value)) throw Object.assign(new Error(`${name} 参数无效`), { statusCode: 400 })
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < 0) throw Object.assign(new Error(`${name} 参数无效`), { statusCode: 400 })
    if (name === 'limit' && number < 1) throw Object.assign(new Error('limit 参数无效'), { statusCode: 400 })
    return max == null ? number : Math.min(max, number)
  }
  const sort = url.searchParams.get('sort') || defaults.sort
  if (!SORT_NAME.test(sort) || !defaults.sorts.includes(sort)) throw Object.assign(new Error('sort 参数无效'), { statusCode: 400 })
  const order = url.searchParams.get('order') || defaults.order || 'desc'
  if (order !== 'asc' && order !== 'desc') throw Object.assign(new Error('order 参数无效'), { statusCode: 400 })
  const q = (url.searchParams.get('q') || '').trim()
  if (q.length > 120) throw Object.assign(new Error('q 参数过长'), { statusCode: 400 })
  return { offset: readInt('offset', 0), limit: readInt('limit', 100, 500) || 1, q, sort, order }
}

const text = (value: unknown) => String(value ?? '').toLocaleLowerCase().replace(/\s+/g, '')

/** 对内存列表执行稳定过滤和排序；调用方在此之后再映射当前页。 */
const views = new Map<string, { items: any[]; bytes: number }>()
const fallbackVersions = new WeakMap<object, string>()
let sequence = 0
const epoch = crypto.randomUUID()

export function pageItems<T>(items: T[], query: PageQuery, pick: { text: (item: T) => string; sort: Record<string, (item: T) => string | number>; id?: (item: T) => string; version?: string; scope?: string; filterKey?: string; filter?: (item: T) => boolean }): PageResult<T> {
  let version = pick.version || fallbackVersions.get(items)
  if (!version) { version = `${epoch}:${++sequence}`; fallbackVersions.set(items, version) }
  const cacheKey = JSON.stringify([pick.scope || '', version, text(query.q), query.sort, query.order, pick.filterKey || ''])
  let view = views.get(cacheKey)
  if (view) { views.delete(cacheKey); views.set(cacheKey, view); return { total: view.items.length, offset: query.offset, limit: query.limit, version, items: view.items.slice(query.offset, query.offset + query.limit) } }
  const needle = text(query.q)
  const filtered = items.filter(item => (!pick.filter || pick.filter(item)) && (!needle || text(pick.text(item)).includes(needle)))
  const getter = pick.sort[query.sort] || pick.sort.name
  const direction = query.order === 'asc' ? 1 : -1
  const id = pick.id || (item => String((item as any)?.id ?? (item as any)?.filename ?? ''))
  filtered.sort((a, b) => {
    const left = getter(a), right = getter(b)
    const primary = typeof left === 'number' && typeof right === 'number' ? left - right : text(left).localeCompare(text(right), 'zh-CN')
    return primary * direction || id(a).localeCompare(id(b))
  })
  view = { items: filtered, bytes: filtered.length * 128 }
  if (view.bytes <= 32 * 1024 * 1024) views.set(cacheKey, view)
  while (views.size > 8 || [...views.values()].reduce((n, row) => n + row.bytes, 0) > 32 * 1024 * 1024) views.delete(views.keys().next().value!)
  return { total: filtered.length, offset: query.offset, limit: query.limit, version, items: filtered.slice(query.offset, query.offset + query.limit) }
}

/** 生成区分账号、查询和精确页的 ETag。 */
export function pageEtag(scope: string, source: string, query: PageQuery, result: PageResult<unknown>): string {
  const key = JSON.stringify({ scope, source, version: result.version, q: query.q, sort: query.sort, order: query.order, offset: query.offset, limit: query.limit })
  return `"${crypto.createHash('sha1').update(key).digest('hex')}"`
}
