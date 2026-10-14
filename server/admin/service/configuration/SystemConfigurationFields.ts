/** 后台缺失的系统字段元数据，值类型与现有业务默认值一致。 @author yahyaoo */
import { libraryConfigurationFields, validateLibraryConfiguration } from './LibraryConfigurationFields'
export const additionalConfigurationFields = [
  ...libraryConfigurationFields,
  { key: 'clientChannel.reportIntervalMinutes', label: '状态上报间隔（分钟）', type: 'number', min: 0, max: 1440, group: '基本配置', hint: '默认 30 分钟；0 恢复立即上报。歌单、收藏与设置仍在 2 秒内提交；新连接生效。' },
  { key: 'clientChannel.progressThrottleMs', label: '通道进度推送节流（毫秒）', type: 'number', min: 200, max: 5000, group: '基本配置', hint: '默认 500；完成、失败和队列变更立即推送。' },
  { key: 'clientChannel.maxBatchOps', label: '状态上报条数阈值', type: 'number', min: 1, max: 512, group: '基本配置', hint: '默认 200；达到阈值后分批提交。' },
  { key: 'clientChannel.maxBatchBytes', label: '状态上报字节阈值', type: 'number', min: 1024, max: 1048576, group: '基本配置', hint: '默认 262144；退出保活提交受浏览器限额限制，未确认数据保留。' },
  { key: 'clientChannel.legacyProgressPolling', label: '临时进度采样回退', type: 'checkbox', group: '基本配置', hint: '默认关闭。只在已订阅且有活动任务时临时采样；事件完整接入后关闭。' },
  { key: 'auth.sessionDays', label: '普通登录有效期（天）', type: 'number', min: 1, max: 365, group: '基本配置', hint: '账号登录必须验证；普通登录关闭浏览器后需重新登录。修改后立即生效。' },
  { key: 'auth.rememberMeDays', label: '记住我有效期（天）', type: 'number', min: 1, max: 365, group: '基本配置', hint: '记住登录可跨浏览器重开和服务重启；缩短有效期立即生效。' },
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
  validateLibraryConfiguration(input)
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
