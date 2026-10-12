/** 漫游权重扩展接口，模型接入只需替换提供器。 @author yahyaoo @date 2026-10-12 */
import type { ExperienceRepository } from '../repository/ExperienceRepository'
type ExtraWeightProvider = (username: string) => Promise<Record<string, number>>
let extraWeightProvider: ExtraWeightProvider = async () => ({})
export const setRoamingWeightProvider = (provider: ExtraWeightProvider) => { extraWeightProvider = provider }
/** 累计记录使用独立文档，不受最近播放列表清空和裁剪影响。 */
export const roamingKey = (song: any) => `${song.source}:${String(song.songmid || song.meta?.songmid || song.id).replace(new RegExp('^' + song.source + '_'), '')}`
/** 首次读取兼容已有播放次数，之后使用独立累计，不受清空最近播放影响。 */
function readCounts(repository: ExperienceRepository) {
  const counts = repository.read<Record<string, number>>('client_recent_setting', 'roaming-counts.json', {})
  for (const song of repository.read<any[]>('client_recent_play', 'recent-play.json', [])) {
    const key = roamingKey(song)
    if (Number.isSafeInteger(song.playCount) && song.playCount > (counts[key] || 0)) counts[key] = song.playCount
  }
  repository.write('client_recent_setting', 'roaming-counts.json', counts)
  return counts
}
export const getRoamingWeights = async (username: string, repository: ExperienceRepository) => ({ counts: readCounts(repository), extraWeights: await extraWeightProvider(username) })
export const recordRoamingPlay = (song: any, repository: ExperienceRepository) => {
  const counts = readCounts(repository)
  const key = roamingKey(song)
  const sessions = repository.read<Record<string, string>>('client_recent_setting', 'roaming-sessions.json', {})
  if (sessions[key] === song.playbackId) return false
  sessions[key] = song.playbackId
  counts[key] = Math.min(Number.MAX_SAFE_INTEGER, (Number.isSafeInteger(counts[key]) ? counts[key] : 0) + 1)
  repository.write('client_recent_setting', 'roaming-counts.json', counts)
  repository.write('client_recent_setting', 'roaming-sessions.json', sessions)
  return true
}
