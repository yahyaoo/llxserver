import fs from 'node:fs'
import path from 'node:path'

/**
 * 校验索引中的音频确实位于配置目录内，排除半成品、空文件及越界链接。
 * @param root 服务端配置的目录根路径。
 * @param item 已有索引条目。
 * @returns 文件存在且有效时返回 true；已删除或非法条目返回 false。
 * @author jingyh
 */
export function hasIndexedAudio(root: string, item: { filename: string; size?: number }): boolean {
  if (!item.filename || path.isAbsolute(item.filename) || !/\.(mp3|flac|m4a|ogg|wav|ape)$/i.test(item.filename)) return false
  const candidate = path.resolve(root, item.filename)
  const relative = path.relative(path.resolve(root), candidate)
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return false
  try {
    const actualRelative = path.relative(fs.realpathSync(root), fs.realpathSync(candidate))
    if (actualRelative.startsWith('..' + path.sep) || actualRelative === '..' || path.isAbsolute(actualRelative)) return false
    const stat = fs.statSync(candidate)
    return stat.isFile() && stat.size > 0 && (item.size === undefined || stat.size === item.size)
  } catch (error: any) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false
    throw error
  }
}

