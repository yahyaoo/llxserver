/** 后台缺失的系统字段元数据，值类型与现有业务默认值一致。 @author yahyaoo */
export const additionalConfigurationFields = [
  { key: 'bindIP', label: '绑定 IP 配置', type: 'text', group: '基本配置', hint: '保留此配置值；当前主 HTTP 服务固定监听 0.0.0.0。' },
  { key: 'port', label: '服务监听端口', type: 'number', min: 1, max: 65535, group: '基本配置', hint: '保存后重启服务；环境变量 PORT 优先。' },
  { key: 'disableTelemetry', label: '禁用匿名数据收集', type: 'checkbox', group: '基本配置', hint: '关闭版本及运行环境的匿名统计，保存后重启服务。' },
  { key: 'cache.namingPattern', label: '缓存命名模式', type: 'select', options: ['simple', 'standard', 'singer_name_quality_album', 'singer_name', 'name_singer'], group: '权限与缓存限制', hint: '默认缓存命名模式，保存后重启；播放器已保存的缓存命名设置优先。' },
  { key: 'serverCacheLocation', label: '服务器缓存位置', type: 'text', group: '权限与缓存限制', hint: 'data、root 或绝对目录路径，保存后重启服务。' },
  { key: 'artist.maxFetchPages', label: '歌手歌曲最大抓取页数', type: 'number', min: 1, max: 100, group: 'Subsonic 协议配置', hint: '限制歌手歌曲列表查询的翻页次数。' },
  { key: 'subsonic.recommendPoolSize', label: '推荐池容量', type: 'number', min: 0, max: Number.MAX_SAFE_INTEGER, group: 'Subsonic 协议配置', hint: '推荐类接口候选池大小；运行时按原规则限制为 20–500。' },
  { key: 'subsonic.transcode.enabled', label: '启用服务端转码', type: 'checkbox', group: 'Subsonic 协议配置', hint: '需安装 ffmpeg，沿用原转码处理逻辑。' },
  { key: 'subsonic.transcode.onQualityMiss', label: '音源缺少目标音质时转码', type: 'checkbox', group: 'Subsonic 协议配置', hint: '关闭后不因音质缺失启动转码。' },
  { key: 'subsonic.transcode.format', label: '转码目标格式', type: 'select', options: ['mp3', 'opus', 'aac'], group: 'Subsonic 协议配置', hint: '保持原转码模块支持的格式。' },
  { key: 'subsonic.transcode.maxConcurrent', label: '转码并发上限', type: 'number', min: 1, max: Number.MAX_SAFE_INTEGER, group: 'Subsonic 协议配置', hint: '限制同时执行的转码任务。' },
] as const

/** @param input 请求配置。 @returns 通过类型和取值校验的新增字段。 @author yahyaoo */
export function validateAdditionalConfiguration(input: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const field of additionalConfigurationFields) {
    if (input[field.key] === undefined) continue
    const value = input[field.key]
    if (field.type === 'checkbox') {
      if (typeof value !== 'boolean') throw new Error(field.label + '必须为布尔值')
    } else if (field.type === 'number') {
      if (!Number.isInteger(value) || value < field.min || value > field.max) throw new Error(field.label + '超出有效范围')
    } else {
      if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) throw new Error(field.label + '格式错误')
      if (field.type === 'select' && !(field.options as readonly string[]).includes(value)) throw new Error(field.label + '选项无效')
    }
    result[field.key] = value
  }
  return result
}
