import type { LxConfigurationDto } from '../../model/dto/LxConfigurationDto'

/** @param value 候选值。 @returns 是否为 JSON 对象。 */
function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param value 候选字段。 @param label 字段名称。 @returns 校验后的对象。 @throws Error 非对象时拒绝。 */
function object(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(label + '必须为对象')
  return value
}

/** @param value 歌曲列表。 @param label 列表名称。 @returns 保持顺序及扩展字段的歌曲数组。 */
function songs(value: unknown, label: string): LX.Music.MusicInfo[] {
  if (!Array.isArray(value) || value.some(item => !isObject(item) || typeof item.id !== 'string' || !item.id)) throw new Error(label + '必须包含具有 id 的歌曲对象')
  return value as LX.Music.MusicInfo[]
}

/** @param value 原服务器歌单。 @returns 无损歌单结构。 */
function listData(value: unknown): LX.Sync.List.ListData {
  const data = object(value, '歌单') as Record<string, any>
  const defaultList = songs(data.defaultList, '默认列表')
  const loveList = songs(data.loveList, '收藏列表')
  if (!Array.isArray(data.userList)) throw new Error('自定义歌单必须为数组')
  const ids = new Set<string>()
  for (const item of data.userList) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id || ['default', 'love'].includes(item.id) || ids.has(item.id) || typeof item.name !== 'string') throw new Error('自定义歌单标识或名称无效')
    ids.add(item.id); songs(item.list, '自定义歌单')
  }
  return { ...data, defaultList, loveList, userList: data.userList }
}

/**
 * 解析洛雪及服务器 JSON 导出。解析阶段不写库，全部校验完成后才允许覆盖。
 * @param input 原 JSON 对象。
 * @returns 校验后的播放器导入参数。
 * @throws Error 未识别格式或任一部分无效时拒绝整个文件。
 * @author yahyaoo
 */
export function parseLxConfiguration(input: unknown): LxConfigurationDto {
  if (!isObject(input)) throw new Error('配置文件必须为 JSON 对象')
  if (input.type === 'playList_v2') {
    if (!Array.isArray(input.data)) throw new Error('playList_v2.data 必须为数组')
    const defaultEntry = input.data.find((item: any) => item?.id === 'default')
    const loveEntry = input.data.find((item: any) => item?.id === 'love')
    const userList = input.data.filter((item: any) => !['default', 'love'].includes(item?.id))
    return { lists: listData({ defaultList: defaultEntry?.list || [], loveList: loveEntry?.list || [], userList }) }
  }
  if (['setting', 'settings', 'config'].includes(input.type) && isObject(input.data)) {
    const data = input.data
    if (['settings', 'setting', 'lists', 'list', 'playList', 'soundEffects', 'library', 'defaultList'].some(key => key in data)) return parseLxConfiguration(data)
    return { settings: object(data, '设置') }
  }
  if (input.type === 'lxserver-configuration' && isObject(input.data)) return parseLxConfiguration(input.data)
  const result: LxConfigurationDto = {}
  if ('defaultList' in input || 'loveList' in input || 'userList' in input) result.lists = listData(input)
  const list = input.lists ?? input.list ?? input.playList
  if (list !== undefined) result.lists = isObject(list) && list.type === 'playList_v2' ? parseLxConfiguration(list).lists : listData(list)
  if ('settings' in input || 'setting' in input) result.settings = object(input.settings ?? input.setting, '设置')
  if ('soundEffects' in input) result.soundEffects = object(input.soundEffects, '音效')
  if ('library' in input) {
    const library = object(input.library, '媒体库') as Record<string, unknown>
    result.library = {}
    for (const key of ['artists', 'albums', 'dislikedArtists', 'dislikedAlbums'] as const) {
      if (!(key in library)) continue
      const items = library[key]
      if (!Array.isArray(items) || items.some(item => !isObject(item))) throw new Error('媒体库 ' + key + ' 必须为对象数组')
      result.library[key] = items
    }
  }
  if (!Object.keys(result).length) {
    // 原 settings.json 直接包含设置键，没有外层包装。
    if (Object.keys(input).some(key => key.includes('.') || /^(enable|preferred|autoUpdate|serverCache|networkList|theme|appearance|volume|downloadConcurrency|playMode)/.test(key))) return { settings: input }
    throw new Error('无法识别洛雪配置格式，请上传设置、playList_v2 或服务器组合配置')
  }
  return result
}
