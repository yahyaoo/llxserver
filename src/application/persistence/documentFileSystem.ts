import nativeFs from 'node:fs'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { migrateLegacy, resolveStorage, storedDocuments, storageEvents } from './storage'

/** @param filename 请求路径。 @returns 与原文件系统一致的不存在错误。 */
function missing(filename: unknown): NodeJS.ErrnoException {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${String(filename)}'`), { code: 'ENOENT', path: String(filename) })
}

/** @param filename 原文件路径。 @returns SQL 文档与存储目标；普通文件返回空值。 */
function lookup(filename: unknown) {
  const target = resolveStorage(filename)
  if (!target) return null
  migrateLegacy(target)
  return { target, document: target.repository.read(target.table, target.key) }
}

/** @param directory 目录路径。 @returns 是否存在只保存在 SQL 中的子文档。 */
function virtualDirectory(directory: unknown): boolean {
  if (typeof directory !== 'string') return false
  const prefix = path.resolve(directory) + path.sep
  return storedDocuments().some(item => item.present && item.document_key.startsWith(prefix))
}

/**
 * 旧业务持久化协议适配器。只替换已登记的数据文档操作，不修改全局 fs。
 * 原业务路径是文档作用域；所有事务与 SQL 都由仓储负责。
 * @author yahyaoo
 */
const documentFileSystem: typeof nativeFs = Object.assign({}, nativeFs)
const adapter: Record<string, any> = documentFileSystem

/** @param filename 原路径。 @param options 原编码参数。 @returns 原格式文本或缓冲区。 */
adapter.readFileSync = (filename: any, options?: any) => {
  const found = lookup(filename)
  if (!found) return nativeFs.readFileSync(filename, options)
  if (!found.document) throw missing(filename)
  const encoding = typeof options === 'string' ? options : options?.encoding
  const buffer = Buffer.from(found.document.text)
  return encoding ? buffer.toString(encoding) : buffer
}

/** @param filename 原路径。 @param data 原 JSON 文本。 @param options 原文件选项。 */
adapter.writeFileSync = (filename: any, data: any, options?: any) => {
  const target = resolveStorage(filename)
  if (!target) return nativeFs.writeFileSync(filename, data, options)
  if (options?.flag === 'wx' && adapter.existsSync(filename)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
  const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
  // 文件编辑器可以保存空文件或尚未完成的 JSON；业务层仍负责原有格式校验。
  target.repository.write(target.table, target.key, text, Date.now(), true)
  storageEvents.emit('change', target.key)
}

/** @param filename 原路径。 @returns 数据库有效文档或普通文件是否存在。 */
adapter.existsSync = (filename: any) => {
  const found = lookup(filename)
  return found ? !!found.document : nativeFs.existsSync(filename) || virtualDirectory(filename)
}

/** @param filename 原路径。删除 SQL 文档并保留迁移墓碑。 */
adapter.unlinkSync = (filename: any) => {
  const target = resolveStorage(filename)
  if (!target) return nativeFs.unlinkSync(filename)
  if (!adapter.existsSync(filename)) throw missing(filename)
  target.repository.remove(target.table, target.key)
  storageEvents.emit('change', target.key)
}

/** @param filename 原路径。 @param options 原统计参数。 @returns 保留快照大小和时间的文件统计。 */
adapter.statSync = (filename: any, options?: any) => {
  const found = lookup(filename)
  if (!found) {
    if (nativeFs.existsSync(filename) || !virtualDirectory(filename)) return nativeFs.statSync(filename, options)
    const stat = Object.create(nativeFs.Stats.prototype) as nativeFs.Stats
    Object.assign(stat, { size: 0, mtimeMs: 0, mtime: new Date(0) })
    stat.isFile = () => false; stat.isDirectory = () => true; stat.isSymbolicLink = () => false
    return stat
  }
  if (!found.document) throw missing(filename)
  const stat = Object.create(nativeFs.Stats.prototype) as nativeFs.Stats
  Object.assign(stat, { size: found.document.byteLength, mtimeMs: found.document.modifiedAt, atimeMs: found.document.modifiedAt, ctimeMs: found.document.modifiedAt, birthtimeMs: found.document.modifiedAt,
    mtime: new Date(found.document.modifiedAt), atime: new Date(found.document.modifiedAt), ctime: new Date(found.document.modifiedAt), birthtime: new Date(found.document.modifiedAt) })
  stat.isFile = () => true; stat.isDirectory = () => false; stat.isSymbolicLink = () => false
  return stat
}
adapter.lstatSync = (filename: any, options?: any) => resolveStorage(filename) || !nativeFs.existsSync(filename) ? adapter.statSync(filename, options) : nativeFs.lstatSync(filename, options)

/** @param directory 原目录。 @param options 枚举选项。 @returns 物理资源和 SQL 文档的去重列表。 */
adapter.readdirSync = (directory: any, options?: any) => {
  const resolved = path.resolve(String(directory))
  const physical = nativeFs.existsSync(resolved) ? nativeFs.readdirSync(resolved, options) : []
  const nameOf = (entry: any) => typeof entry === 'string' ? entry : Buffer.isBuffer(entry) ? entry.toString() : entry.name
  const entries = new Map<string, any>(physical.map((entry: any) => [nameOf(entry), entry]))
  for (const item of storedDocuments()) {
    const relative = path.relative(resolved, item.document_key)
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) continue
    const parts = relative.split(path.sep)
    const name = parts[0]
    const directoryEntry = parts.length > 1
    if (!item.present) { if (!directoryEntry) entries.delete(name); continue }
    if (!entries.has(name)) {
      const dirent = { name, parentPath: resolved, path: resolved, isFile: () => !directoryEntry, isDirectory: () => directoryEntry, isSymbolicLink: () => false, isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false }
      entries.set(name, options?.withFileTypes ? dirent : options?.encoding === 'buffer' || options === 'buffer' ? Buffer.from(name) : name)
    }
  }
  if (!nativeFs.existsSync(resolved) && !entries.size) throw missing(directory)
  return [...entries.values()]
}

/** @param source 原路径。 @param destination 新路径。 @param flags 复制选项。SQL 迁移保持原始格式。 */
adapter.copyFileSync = (source: any, destination: any, flags?: number) => {
  if (!resolveStorage(source) && !resolveStorage(destination)) return nativeFs.copyFileSync(source, destination, flags)
  if (flags === nativeFs.constants.COPYFILE_EXCL && adapter.existsSync(destination)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
  adapter.writeFileSync(destination, adapter.readFileSync(source))
  adapter.utimesSync(destination, adapter.statSync(source).mtime, adapter.statSync(source).mtime)
}

/** @param source 原路径。 @param destination 新路径。临时 JSON 文件写完后原子提交 SQL。 */
adapter.renameSync = (source: any, destination: any) => {
  if (!resolveStorage(source) && virtualDirectory(source)) {
    adapter.cpSync(source, destination, { recursive: true })
    adapter.rmSync(source, { recursive: true, force: true })
    return
  }
  if (!resolveStorage(source) && !resolveStorage(destination)) return nativeFs.renameSync(source, destination)
  adapter.copyFileSync(source, destination)
  adapter.unlinkSync(source)
}

/** @param filename 原路径。 @param atime 原访问时间。 @param mtime 原快照时间。 */
adapter.utimesSync = (filename: any, atime: any, mtime: any) => {
  const target = resolveStorage(filename)
  if (!target) return nativeFs.utimesSync(filename, atime, mtime)
  if (!adapter.existsSync(filename)) throw missing(filename)
  target.repository.touch(target.table, target.key, mtime instanceof Date ? mtime.getTime() : Number(mtime) * 1000)
}

/** @param source 用户目录。 @param destination 新用户目录。 @param options 原复制选项。保留用户改名时的 SQL 文档。 */
adapter.cpSync = (source: any, destination: any, options?: any) => {
  if (nativeFs.existsSync(source)) nativeFs.cpSync(source, destination, options)
  else if (!virtualDirectory(source)) throw missing(source)
  const prefix = path.resolve(source) + path.sep
  for (const item of storedDocuments()) {
    if (!item.document_key.startsWith(prefix)) continue
    const filename = path.join(destination, path.relative(source, item.document_key))
    if (item.present) adapter.copyFileSync(item.document_key, filename)
    else {
      // 原 JSON 可能仍保留在磁盘，改名时也要复制墓碑，防止新作用域再次导入。
      const target = resolveStorage(filename)
      target?.repository.remove(target.table, target.key)
    }
  }
}

/** @param filename 文件或目录。 @param options 原删除选项。删除作用域内的 SQL 文档。 */
adapter.rmSync = (filename: any, options?: any) => {
  const resolved = path.resolve(filename)
  for (const item of storedDocuments()) {
    if (item.document_key === resolved || (options?.recursive && item.document_key.startsWith(resolved + path.sep))) item.repository.remove(item.table_name, item.document_key)
  }
  if (nativeFs.existsSync(filename) || options?.force) nativeFs.rmSync(filename, options)
}

/** @param filename 原路径。 @param options 原读流参数。 @returns 业务 JSON 导出流或普通资源流。 */
adapter.createReadStream = (filename: any, options?: any) => {
  if (!resolveStorage(filename)) return nativeFs.createReadStream(filename, options)
  const buffer = adapter.readFileSync(filename)
  return Readable.from([buffer.subarray(options?.start || 0, options?.end === undefined ? buffer.length : options.end + 1)])
}

/** @param filename 原写入路径。 @param options 原写流选项。只有完整流成功结束后才替换 SQL 文档。 */
adapter.createWriteStream = (filename: any, options?: any) => {
  if (!resolveStorage(filename)) return nativeFs.createWriteStream(filename, options)
  const chunks: Buffer[] = []
  return new Writable({
    /**
     * 写入 write 对应的业务能力，参数和执行顺序保持原实现。
     * @param chunk chunk 原业务参数。
     * @param encoding encoding 原业务参数。
     * @param callback 原完成回调。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback() },
    /**
     * 处理 final 对应的业务能力，参数和执行顺序保持原实现。
     * @param callback 原完成回调。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    final(callback) {
      try { adapter.writeFileSync(filename, Buffer.concat(chunks), options); callback() } catch (error) { callback(error as Error) }
    },
  })
}

// 原回调仍在后续任务执行，保留 throttle、快照清理及错误传播的时序。
for (const name of ['readFile', 'writeFile', 'unlink', 'stat', 'lstat', 'readdir', 'rename', 'copyFile', 'utimes', 'rm']) {
  adapter[name] = (...args: any[]) => {
    const callback = args.pop()
    let result: any, error: any
    try { result = adapter[name + 'Sync'](...args) } catch (caught) { error = caught }
    queueMicrotask(() => callback(error || null, result))
  }
}
adapter.promises = Object.assign({}, nativeFs.promises)
for (const name of ['readFile', 'writeFile', 'unlink', 'stat', 'lstat', 'readdir', 'rename', 'copyFile', 'utimes', 'rm', 'cp']) {
  adapter.promises[name] = async (...args: any[]) => adapter[name + 'Sync'](...args)
}

export default documentFileSystem
