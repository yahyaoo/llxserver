import { isDisliked, parseDislikeRules, splitSingers, normalizeText, type DislikeMatchInput, type DislikeMatchOptions } from './match'
import { encodeAlbumRule } from './utils'

/**
 * 解除歌曲实际命中的规则，并保留未参与本次屏蔽的条目。
 * @param song 要恢复的歌曲。
 * @param rules 原生不喜欢规则串。
 * @param artists 不喜欢歌手列表。
 * @param albums 不喜欢专辑列表。
 * @param options 当前匹配设置。
 * @returns 解除后的规则串及歌手、专辑列表。
 */
export function removeMatchedDislikes(song: DislikeMatchInput, rules: string, artists: any[], albums: any[], options: DislikeMatchOptions) {
  const artistRule = (item: any) => `@${normalizeText(String(item.name || ''))}`
  const albumRule = (item: any) => splitSingers(item.artistName).map(singer => encodeAlbumRule(String(item.name || ''), singer)).join('\n')
  const lines = rules.split('\n').filter(line => line.trim())
  const combined = parseDislikeRules([...lines, ...artists.map(artistRule), ...albums.map(albumRule)].join('\n'))
  const empty = () => parseDislikeRules('')
  const active = new Set<string>()
  for (const dimension of ['exact', 'musicNames', 'singerNames', 'albums'] as const) {
    const subset = { ...empty(), [dimension]: combined[dimension] }
    if (isDisliked(song, subset, options)) active.add(dimension)
  }
  const matches = (rule: string) => {
    const subset = parseDislikeRules(rule)
    const relevant = [...active].some(dimension => (subset as any)[dimension].size > 0)
    // 全部歌手模式下，单条规则是整体命中的组成部分；逐条删除时按任一歌手判断。
    return relevant && isDisliked(song, subset, { ...options, duetMode: options.duetMode === 'primary' ? 'primary' : 'any' })
  }
  return {
    rules: lines.filter(line => !matches(line)).join('\n'),
    artists: artists.filter(item => !matches(artistRule(item))),
    albums: albums.filter(item => !matches(albumRule(item))),
  }
}
