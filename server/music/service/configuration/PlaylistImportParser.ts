import { parseLxConfiguration } from './LxConfigurationParser'

/** 已校验且保留扩展字段的导入歌单。 @author jingyh */
export type ImportedPlaylist = LX.Sync.List.ListData['userList'][number]

/**
 * 校验单个歌单，保留歌曲顺序、重复项与扩展字段。
 * @param value 上传文件中的歌单对象。
 * @returns 已校验的歌单。
 * @throws Error 标识、名称或歌曲结构不合法时拒绝整个文件。
 * @author jingyh
 */
function playlist(value: any): ImportedPlaylist {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !value.id.trim()) throw new Error('歌单标识无效')
  const name = value.name ?? (value.id === 'default' ? '默认列表' : value.id === 'love' ? '我的喜爱' : '')
  if (typeof name !== 'string' || !name.trim()) throw new Error('歌单名称不能为空')
  if (!Array.isArray(value.list) || value.list.some((song: any) => !song || typeof song !== 'object' || Array.isArray(song) || typeof song.id !== 'string' || !song.id.trim())) throw new Error('歌单必须包含具有 id 的歌曲对象')
  return { ...value, name }
}

/**
 * 复用洛雪配置解析器识别歌单备份，并兼容本站单歌单导出。
 * @param input 已解码的 JSON 对象。
 * @returns 按文件顺序排列的待追加歌单；默认与喜爱列表也作为新歌单导入。
 * @throws Error 未识别格式、未知版本或任一歌单无效时拒绝。
 * @author jingyh
 */
export function parsePlaylistImport(input: unknown): ImportedPlaylist[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('歌单文件必须为 JSON 对象')
  const data = input as Record<string, any>
  if (data.type === 'lxserver-playlist') {
    if (data.version !== 1) throw new Error('不支持此歌单文件版本')
    return [playlist(data.playlist)]
  }
  if (data.type === 'playList_v2') {
    if (!Array.isArray(data.data) || !data.data.length) throw new Error('备份中没有可导入的歌单')
    const lists = data.data.map(playlist)
    if (new Set(lists.map((item: ImportedPlaylist) => item.id)).size !== lists.length) throw new Error('备份中存在重复歌单标识')
    // 复用现有洛雪格式校验；保持原文件顺序和默认列表的名称。
    parseLxConfiguration({ ...data, data: lists })
    return lists
  }
  const parsed = parseLxConfiguration(input)
  if (!parsed.lists) throw new Error('文件中没有歌单，请选择歌单 JSON 备份')
  const { defaultList, loveList, userList } = parsed.lists
  const lists = [
    ...(defaultList.length ? [{ id: 'default', name: '默认列表', list: defaultList }] : []),
    ...(loveList.length ? [{ id: 'love', name: '我的喜爱', list: loveList }] : []),
    ...userList,
  ].map(playlist)
  if (!lists.length) throw new Error('备份中没有可导入的歌单')
  return lists
}
