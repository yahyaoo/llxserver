/** 自定义发布仓库的更新检查；默认关闭，不依赖统计服务。 @author jingyh */
export const DEFAULT_UPDATE_SERVER = 'https://api.github.com/repos/yahyaoo/fn-lxserver/releases/latest'

/** 检查完整的发布 API 地址，只允许 HTTP 和 HTTPS。 */
export const validateUpdateServer = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请填写检查更新服务器地址')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('检查更新服务器地址必须是完整 URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('更新地址仅支持 HTTP/HTTPS，请使用独立访问令牌认证')
  url.hash = ''
  return url.href
}

/** 同时比较官方与 v_jyh_ 前缀版本，并支持后续数字修订号。 */
export const compareAppVersions = (left: string, right: string) => {
  const a = left.match(/\d+/g)?.map(Number) || []
  const b = right.match(/\d+/g)?.map(Number) || []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1
  }
  return 0
}

/** 由服务端查询配置中的发布 API，避免浏览器跨域及 HTTPS 页面访问 HTTP 仓库失败。 */
export const checkAppUpdate = async (currentVersion: string) => {
  if (global.lx.config['update.enabled'] !== true) return { enabled: false, currentVersion }
  const url = validateUpdateServer(global.lx.config['update.server'] || DEFAULT_UPDATE_SERVER)
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'lxserver-jyh' }
  const token = global.lx.config['update.token']
  if (token) headers.Authorization = `token ${token}`
  // 不把认证头转发到重定向目标；发布 API 应填写最终地址。
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error([401, 403, 404].includes(response.status) ? `更新服务器返回 HTTP ${response.status}，请检查地址或私有仓库访问令牌` : `更新服务器返回 HTTP ${response.status}`)
  const text = await response.text()
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('更新服务器响应过大')
  const data = JSON.parse(text)
  const version = data.tag_name || data.version
  if (typeof version !== 'string' || !/^v?(?:_jyh_)?\d+\.\d+\.\d+(?:[._-][\w.-]+)?$/.test(version) || data.draft === true) throw new Error('更新服务器未返回有效的发布版本')
  let releaseUrl = ''
  try {
    const parsed = new URL(data.html_url || data.url || url)
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) releaseUrl = parsed.href
  } catch { }
  return { enabled: true, currentVersion, version, hasUpdate: compareAppVersions(currentVersion, version) < 0,
    releaseUrl, notes: typeof data.body === 'string' ? data.body.slice(0, 20000) : '' }
}
