/** B-group settings, shared by admin rendering, saving and legacy import validation. */
export const libraryConfigurationFields = [
  { key: 'library.scan.enabled', label: '后台自动扫描', type: 'checkbox', group: '音乐库扫描', hint: '关闭后停止自动任务和监听，仍可手动扫描。' },
  { key: 'library.scan.legacy', label: '兼容全量扫描', type: 'checkbox', group: '音乐库扫描', hidden: true, hint: '显式回退：关闭监听并将 quick 转为 full，仍复用唯一调度器；会增加磁盘读取。' },
  { key: 'library.scan.defaultMinutes', label: '新目录扫描间隔（分钟）', type: 'number', min: 1, max: 1440, group: '音乐库扫描', hint: '仅新目录使用；已有目录保留原间隔。监听正常时 quick 间隔至少 360 分钟。' },
  { key: 'library.scan.fullScanHours', label: '完整扫描周期（小时）', type: 'number', min: 0, max: 720, group: '音乐库扫描', hint: '默认 24；0 关闭兜底。监听不可靠时可能漏掉原地修改，quick 无法保证检测。' },
  { key: 'library.scan.watch', label: '目录监听总开关', type: 'checkbox', group: '音乐库扫描', hint: '目录可以独立覆盖；原生监听失败自动降级。' },
  { key: 'library.scan.watchDebounceSeconds', label: '监听防抖（秒）', type: 'number', min: 2, max: 300, group: '音乐库扫描', hint: '合并变化；最多等待此值的 5 倍。' },
  { key: 'library.scan.startupDelaySeconds', label: '启动 quick 延迟（秒）', type: 'number', min: 0, max: 86400, group: '音乐库扫描', hint: '默认 60，0 不执行启动扫描；缺少有效状态时才需要 full。' },
  { key: 'library.scan.ioPauseMs', label: '标签读取间隔（毫秒）', type: 'number', min: 0, max: 200, group: '音乐库扫描', hint: '机械盘可设 5～20；默认 0。' },
  { key: 'library.scan.lyricWriteMode', label: '扫描后歌词写入方式', type: 'select', options: ['sidecar', 'embedded', 'both'], group: '音乐库扫描', hint: '默认 sidecar，只补缺失的旁挂 .lrc；embedded 写入音频标签；both 同时写入。内嵌方式会修改音频文件。' },
  { key: 'library.scan.embedCover', label: '扫描后内嵌封面', type: 'checkbox', group: '音乐库扫描', hint: '默认关闭。仅在本地媒体缓存已有封面时，使用安全暂存方式写入音频文件。' },
  { key: 'library.scan.watchMode', label: '监听模式', type: 'select', options: ['auto', 'native', 'polling', 'off'], group: '音乐库扫描', hint: 'auto 关闭网络盘监听；native 强制使用仍需 full 兜底；polling 仅低频扫描，间隔至少 5 分钟。' },
  { key: 'library.prefetch.enabled', label: '扫描后预取', type: 'checkbox', group: '封面与歌词预取', hint: '关闭后仅请求时读取，保留有效缓存。' },
  { key: 'library.prefetch.cover', label: '预取封面', type: 'checkbox', group: '封面与歌词预取', hint: '内嵌封面优先，再用已有远程封面地址。' },
  { key: 'library.prefetch.lyric', label: '预取歌词', type: 'checkbox', group: '封面与歌词预取', hint: '本地 LRC、内嵌歌词优先；联网只用于已关联歌曲，不写音频。' },
  { key: 'library.prefetch.network', label: '允许网络预取', type: 'checkbox', group: '封面与歌词预取', hint: '关闭仍提取本地资源。' },
  { key: 'library.prefetch.concurrency', label: '全服务本地并发', type: 'number', min: 1, max: 4, group: '封面与歌词预取', hint: '所有用户共用预算，默认 2。' },
  { key: 'library.prefetch.maxCacheMB', label: '每用户媒体缓存预算（MB）', type: 'number', min: 1, max: 102400, group: '封面与歌词预取', hint: '封面与只读歌词合计默认 256 MB；每 50 项及队列完成后清理，允许批次内暂时超过预算，不删除音频或用户索引。' },
  { key: 'library.prefetch.networkPerMinute', label: '网络请求每分钟上限', type: 'number', min: 1, max: 300, group: '封面与歌词预取', hint: '默认 30，网络通道串行。' },
  { key: 'library.prefetch.backfillOnStartup', label: '首次扫描后补齐', type: 'checkbox', group: '封面与歌词预取', hint: '有界队列按用户轮转补齐历史缺失项。' },
  { key: 'library.autoFix.embedLyric', label: '自动内嵌歌词', type: 'select', options: ['off', 'follow-download', 'on'], group: '自动修复', hint: '默认 off。开启会修改音频；follow-download 跟随下载歌词策略。请先备份，关闭不撤销已写内容。' },
  { key: 'library.autoFix.retag', label: '自动补全标签', type: 'select', options: ['off', 'fill-missing'], group: '自动修复', hint: '仅填空缺字段，不替换已有封面。格式及安全替换未通过验证时跳过。' },
  { key: 'library.autoFix.scope', label: '自动修复范围', type: 'select', options: ['cache', 'cache+custom'], group: '自动修复', hint: '自定义目录还需用户写权限和可靠的独占文件保护；无法证明不占用时跳过。' },
  { key: 'library.autoFix.maxPerRun', label: '每轮文件数', type: 'number', min: 1, max: 5000, group: '自动修复', hint: '默认 200；全服务串行，失败不无条件重试。' },
  { key: 'library.autoFix.quietHours', label: '执行时间段', type: 'text', group: '自动修复', hint: '空值不限；例如 23:00-05:00，使用服务器本地时间。' },
  { key: 'library.autoFix.safeWrite', label: '安全暂存保护', type: 'checkbox', group: '自动修复', hint: '默认开启；关闭此保护会禁用自动写入，不允许自动原地覆盖。' },
] as const

export function validateLibraryConfiguration(input: Record<string, any>) {
  const lyricWriteMode = input['library.scan.lyricWriteMode']
  if (lyricWriteMode !== undefined && !['sidecar', 'embedded', 'both'].includes(lyricWriteMode)) throw Error('扫描后歌词写入方式必须为 sidecar、embedded 或 both')
  const hours = input['library.autoFix.quietHours']
  if (hours !== undefined && hours !== '' && !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(hours)) throw Error('自动修复时间段必须为 HH:mm-HH:mm')
}
