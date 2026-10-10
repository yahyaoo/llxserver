/** dislikeDataManage 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import fs from 'node:fs'
import path from 'node:path'
import { SPLIT_CHAR } from '../../../constants'
import { type SnapshotDataManage } from './snapshotDataManage'
import { filterRules, encodeAlbumRule } from './utils'

/**
 * DislikeDataManage 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export class DislikeDataManage {
  /**
   * snapshotDataManage 字段，沿用原业务结构与空值约定。
   */
  snapshotDataManage: SnapshotDataManage
  /**
   * dislikeRules 字段，沿用原业务结构与空值约定。
   */
  dislikeRules: LX.Dislike.DislikeListData = { dislikeList: [] }

  /**
   * 构造实例 constructor 对应的业务能力，参数和执行顺序保持原实现。
   * @param snapshotDataManage snapshotDataManage 原业务参数。
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
   * 获取 getDislikeRules 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDislikeRules = async(): Promise<LX.Dislike.DislikeRules> => {
    return this.dislikeRules
  }

  // Returns all active rule strings separated by newline (used by dislikeCache for parsing)
  /**
   * 获取 getDislikeRulesString 对应的业务能力，参数和执行顺序保持原实现。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  getDislikeRulesString = (): string => {
    return this.dislikeRules.dislikeList
      .map(s => this.buildDislikeRule(s))
      .filter(Boolean)
      .join('\n')
  }

  /**
   * 添加 addDislikeInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @param infos infos 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 添加 addDislikeAlbums 对应的业务能力，参数和执行顺序保持原实现。
   * @param infos infos 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
   * 处理 overwirteDislikeInfo 对应的业务能力，参数和执行顺序保持原实现。
   * @param rulesString rulesString 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  overwirteDislikeInfo = async(rulesString: string) => {
    // Called when removing items: keep only entries whose rule key is still in the string
    const validRules = new Set(filterRules(rulesString))
    this.dislikeRules.dislikeList = this.dislikeRules.dislikeList.filter(item => validRules.has(this.buildDislikeRule(item)))
    return this.dislikeRules
  }
}
