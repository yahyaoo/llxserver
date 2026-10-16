import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { repositories } from '../persistence/storage'
import storageFs from '../persistence/documentFileSystem'

export interface MusicDirectory { id: string; path: string; scanMinutes: number; watch?: boolean }

/** 账号重命名时迁移音乐库索引，保留已有平台关联。 */
export function renameMusicDirectoryIndex(previous: string, next: string): void {
  const index = (name: string) => path.join(global.lx.dataPath, 'library', crypto.createHash('sha256').update(name).digest('hex'), 'custom_index.json')
  const source = index(previous), target = index(next)
  if (storageFs.existsSync(source)) storageFs.renameSync(source, target)
  const previousRoot = path.dirname(source), nextRoot = path.dirname(target)
  for (const name of ['scan_state.json', 'prefetch_state.json', 'auto_fix_state.json']) {
    const oldState = path.join(previousRoot, name)
    if (storageFs.existsSync(oldState)) storageFs.renameSync(oldState, path.join(nextRoot, name))
  }
  const previousMedia = path.join(previousRoot, 'media')
  if (fs.existsSync(previousMedia)) { fs.mkdirSync(nextRoot, { recursive: true }); fs.renameSync(previousMedia, path.join(nextRoot, 'media')) }
}

/** 读取子表并一次性迁移旧单目录配置，目录清空后不会重新导入。 */
export function getMusicDirectories(username: string, includeDisabled = false): MusicDirectory[] {
  const user = global.lx.config.users.find(user => user.name === username)
  if (!user) return []
  const repository = repositories().admin
  let directories = repository.readMusicDirectories(username)
  if (!(user as any).musicDirectoriesMigrated) {
    if (!directories.length && user.customMusicDir) {
      directories = [{ id: crypto.createHash('sha256').update(path.resolve(user.customMusicDir)).digest('hex').slice(0, 16), path: path.resolve(user.customMusicDir), scanMinutes: 30 }]
      repository.saveMusicDirectories(username, directories)
    }
    ;(user as any).musicDirectoriesMigrated = true
  }
  return includeDisabled || user.enableCustomMusicDir ? directories : []
}

/** 实际读取和创建临时文件检测权限；失败时要求管理员赋予目录读写权限。 */
export async function checkDirectory(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !path.isAbsolute(value.trim()) || /[<>"|?*\x00-\x1f]/.test(value)) throw new Error('音乐目录必须是有效的服务器绝对路径')
  const directory = path.resolve(value.trim())
  let probe: string | undefined
  try {
    if (!(await fs.promises.stat(directory)).isDirectory()) throw new Error('不是目录')
    await fs.promises.access(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK)
    await fs.promises.readdir(directory)
    probe = path.join(directory, `.llx-permission-${crypto.randomUUID()}`)
    await fs.promises.writeFile(probe, 'permission-check', { flag: 'wx' })
    await fs.promises.readFile(probe)
    await fs.promises.unlink(probe)
    probe = undefined
    return directory
  } catch (error: any) {
    throw new Error(`目录无法读写，请赋予服务进程目录读写权限后再保存：${directory}（${error.code || error.message}）`)
  } finally {
    if (probe) await fs.promises.unlink(probe).catch(() => {})
  }
}

/** 保存前校验整个集合，使用已有路径的稳定标识，拒绝重复目录。 */
export async function validateDirectories(username: string, values: unknown): Promise<MusicDirectory[]> {
  if (!Array.isArray(values) || values.length > 32) throw new Error('音乐目录配置必须为数组，最多 32 个目录')
  const previous = repositories().admin.readMusicDirectories(username)
  const result: MusicDirectory[] = []
  for (const value of values) {
    const directory = await checkDirectory(value?.path)
    const scanMinutes = value.scanMinutes ?? previous.find(item => item.path === directory)?.scanMinutes ?? global.lx.config['library.scan.defaultMinutes'] ?? 60
    if (!Number.isInteger(scanMinutes) || scanMinutes < 1 || scanMinutes > 1440) throw new Error('扫描频率必须为 1～1440 分钟')
    if (result.some(item => item.path === directory)) throw new Error('不能重复配置相同的音乐目录')
    const id = previous.find(item => item.path === directory)?.id || crypto.createHash('sha256').update(directory).digest('hex').slice(0, 16)
    if (value.watch != null && typeof value.watch !== 'boolean') throw new Error('目录监听必须为布尔值或空值')
    result.push({ id, path: directory, scanMinutes, ...(value.watch == null ? {} : { watch: value.watch }) })
  }
  return result
}

/** 根据目录标识安全定位文件，并拒绝越界及符号链接逃逸。 */
export function resolveMusicFile(username: string, filename: string, allowMissing = false): string | null {
  const directories = getMusicDirectories(username)
  const match = /^@([a-f0-9]{16})\/(.+)$/.exec(filename)
  const directory = match ? directories.find(item => item.id === match[1]) : directories[0]
  if (!directory) return null
  const relative = match ? match[2] : filename
  const resolved = path.resolve(directory.path, relative)
  if (!resolved.startsWith(directory.path + path.sep)) return null
  try {
    const actual = fs.existsSync(resolved) ? fs.realpathSync(resolved) : allowMissing ? path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved)) : ''
    const root = fs.realpathSync(directory.path)
    return actual.startsWith(root + path.sep) ? actual : null
  } catch { return null }
}
