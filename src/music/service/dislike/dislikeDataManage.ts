/** 不喜欢数据管理：保存结构化条目并生成歌名、歌手和专辑规则。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import fs from 'node:fs'
import path from 'node:path'
import { SPLIT_CHAR } from '../../../constants'
import { type SnapshotDataManage } from './snapshotDataManage'
import { filterRules, encodeAlbumRule } from './utils'

/** 维护用户的不喜欢条目、文本规则和快照数据。 @author yahyaoo */
export class DislikeDataManage {
  /** 当前用户快照管理器。 */
  snapshotDataManage: SnapshotDataManage
  /** 用户不喜欢规则集合。 */
  dislikeRules: LX.Dislike.DislikeListData = { dislikeList: [] }

  /**
 * 绑定用户不喜欢数据目录并准备条目和规则映射。
 * @param snapshotDataManage 当前用户的快照管理器。
 * @author yahyaoo
 */
  constructor(snapshotDataManage: SnapshotDataManage) {
    this.snapshotDataManage = snapshotDataManage

    try {
      const latest = this.snapshotDataManage.snapshotInfo?.latest
      if (latest) {
        const filePath = path.join(this.snapshotDataManage.snapshotDir, `snapshot_${latest}`)
        if (storageFs.existsSync(filePath)) {
          const content = storageFs.readFileSync(filePath, 'utf-8').trim()
          if (content.startsWith('{')) {
            const parsed = JSON.parse(content)
            this.dislikeRules = parsed
            // normalize: populate missing dislikeRule fields from name/singer
            this.normalizeRules()
          }
        }
      }
    } catch { /* ignore */ }

    void this.snapshotDataManage.getSnapshotInfo().then(async(snapshotInfo) => {
      if (!snapshotInfo.latest) return
      const data = await this.snapshotDataManage.getSnapshot(snapshotInfo.latest)
      if (data) {
        this.dislikeRules = data
        this.normalizeRules()
      }
    })
  }

  /**
   * 补齐历史屏蔽条目的规范规则串：优先使用已有规则，再按歌曲名与歌手构造。
   * @param item 原屏蔽条目，可能只有歌曲名称或歌手名称。
   * @returns 名称@歌手、@歌手或名称；两者为空时返回空串。
   * @author yahyaoo
   */
  private buildDislikeRule(item: LX.Dislike.DislikeSongInfo): string {
    if (item.dislikeRule) return item.dislikeRule
    const name = (item.name ?? '').trim()
    const singer = (item.singer ?? '').trim()
    if (name && singer) return `${name}${SPLIT_CHAR.DISLIKE_NAME}${singer}`
    if (singer) return `${SPLIT_CHAR.DISLIKE_NAME}${singer}`
    return name
  }

  /**
   * 快照载入后补齐缺少的 dislikeRule，使文本规则读取与结构化条目一致。
   * 只填充缺失字段，不改变已有规则、顺序或重复项。
   * @author yahyaoo
   */
  private normalizeRules() {
    for (const item of this.dislikeRules.dislikeList) {
      if (!item.dislikeRule) {
        item.dislikeRule = this.buildDislikeRule(item)
      }
    }
  }

  // Returns the structured object
  /**
 * 读取当前用户的不喜欢规则，用于歌曲、歌手和专辑过滤。
 * @author yahyaoo
 */
  getDislikeRules = async(): Promise<LX.Dislike.DislikeRules> => {
    return this.dislikeRules
  }

  // Returns all active rule strings separated by newline (used by dislikeCache for parsing)
  /**
 * 将结构化不喜欢条目转换为客户端使用的规则字符串。
 * @author yahyaoo
 */
  getDislikeRulesString = (): string => {
    return this.dislikeRules.dislikeList
      .map(s => this.buildDislikeRule(s))
      .filter(Boolean)
      .join('\n')
  }

  /**
 * 添加不喜欢歌曲或歌手条目，并更新当前规则数据。
 * @param infos 批量业务条目。
 * @author yahyaoo
 */
  addDislikeInfo = async(infos: LX.Dislike.DislikeSongInfo[]) => {
    // Check for duplicates
    const currentRules = new Set(this.dislikeRules.dislikeList.map(s => this.buildDislikeRule(s)))
    for (const info of infos) {
      const rule = this.buildDislikeRule(info)
      if (!rule) continue
      if (!currentRules.has(rule)) {
        info.dislikeRule = rule
        this.dislikeRules.dislikeList.push(info)
        currentRules.add(rule)
      }
    }
    return this.dislikeRules
  }

  /**
 * 添加不喜欢专辑条目，并生成可匹配的专辑规则。
 * @param infos 批量业务条目。
 * @author yahyaoo
 */
  addDislikeAlbums = async(infos: LX.Dislike.DislikeAlbumInfo[]) => {
    if (!infos || infos.length === 0) return this.dislikeRules
    const currentRules = new Set(this.dislikeRules.dislikeList.map(s => this.buildDislikeRule(s)))
    const lines = infos.map(info => encodeAlbumRule(info.albumName, info.singer))

    for (let i = 0; i < lines.length; i++) {
      const rule = lines[i]
      if (!currentRules.has(rule)) {
        this.dislikeRules.dislikeList.push({
          name: '',
          singer: '',
          dislikeRule: rule
        })
        currentRules.add(rule)
      }
    }
    return this.dislikeRules
  }

  /**
 * 用传入条目覆盖当前不喜欢数据并更新规则索引。
 * @param rulesString 客户端格式的不喜欢规则文本。
 * @author yahyaoo
 */
  overwirteDislikeInfo = async(rulesString: string) => {
    // Called when removing items: keep only entries whose rule key is still in the string
    const validRules = new Set(filterRules(rulesString))
    this.dislikeRules.dislikeList = this.dislikeRules.dislikeList.filter(item => validRules.has(this.buildDislikeRule(item)))
    return this.dislikeRules
  }
}
