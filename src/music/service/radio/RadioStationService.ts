/** RadioStationService 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
/**
 * 用户自建网络电台（Internet Radio Station）分用户隔离持久化。
 *
 * 与「官方电台」(QQ music radio_tx_*，由 discovery.fetchRadios 实时抓取) 不同，
 * 用户自建电台由用户在客户端（如音流）粘贴 streamUrl 添加，需落盘持久化。
 *
 * 存储路径：data/users/<username>/radioStations.json
 * 各用户自建电台独立隔离存储，互不干扰。
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserDirname } = require('../../../user')

/**
 * RadioStation 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface RadioStation {
  /**
   * id 字段，沿用原业务结构与空值约定。
   */
  id: string
  /**
   * name 字段，沿用原业务结构与空值约定。
   */
  name: string
  /**
   * streamUrl 字段，沿用原业务结构与空值约定。
   */
  streamUrl: string
  /**
   * homepageUrl 字段，沿用原业务结构与空值约定。
   */
  homepageUrl?: string
}

const userCaches = new Map<string, RadioStation[]>()

/**
 * 获取 getUserStoreFile 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
function getUserStoreFile(username: string): string {
  const userPath = (global.lx && global.lx.userPath) || path.join(process.cwd(), 'data', 'users')
  const userDir = path.join(userPath, getUserDirname(username || 'default'))
  return path.join(userDir, 'radioStations.json')
}

/**
 * 加载 load 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
function load(username: string): RadioStation[] {
  if (userCaches.has(username)) return userCaches.get(username)!
  const storeFile = getUserStoreFile(username)
  let stations: RadioStation[] = []
  try {
    if (storageFs.existsSync(storeFile)) {
      const raw = JSON.parse(storageFs.readFileSync(storeFile, 'utf-8'))
      stations = Array.isArray(raw?.stations) ? raw.stations : []
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error(`[电台服务] 解析/加载用户 ${username} 的电台配置异常:`, err)
    }
    stations = []
  }
  userCaches.set(username, stations)
  return stations
}

/**
 * 持久化 persist 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
function persist(username: string): void {
  const storeFile = getUserStoreFile(username)
  const dir = path.dirname(storeFile)
  if (!storageFs.existsSync(dir)) storageFs.mkdirSync(dir, { recursive: true })
  storageFs.writeFileSync(storeFile, JSON.stringify({ stations: userCaches.get(username) ?? [] }, null, 2), 'utf-8')
}

/**
 * 列举 listRadioStations 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export function listRadioStations(username: string): RadioStation[] {
  return load(username).map(s => ({ ...s }))
}

/**
 * 获取 getRadioStation 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param id 原业务标识。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export function getRadioStation(username: string, id: string): RadioStation | null {
  const s = load(username).find(x => x.id === id)
  return s ? { ...s } : null
}

/**
 * 添加 addRadioStation 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param name 原名称或查询词。
 * @param streamUrl streamUrl 原业务参数。
 * @param homepageUrl homepageUrl 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export function addRadioStation(username: string, name: string, streamUrl: string, homepageUrl?: string): RadioStation {
  const stations = load(username)
  const station: RadioStation = {
    id: `radio_usr_${crypto.randomUUID()}`,
    name,
    streamUrl,
    homepageUrl,
  }
  stations.push(station)
  persist(username)
  return { ...station }
}

/**
 * 更新 updateRadioStation 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param id 原业务标识。
 * @param name 原名称或查询词。
 * @param streamUrl streamUrl 原业务参数。
 * @param homepageUrl homepageUrl 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export function updateRadioStation(
  username: string,
  id: string,
  name?: string,
  streamUrl?: string,
  homepageUrl?: string,
): RadioStation | null {
  const stations = load(username)
  const s = stations.find(x => x.id === id)
  if (!s) return null
  if (name !== undefined) s.name = name
  if (streamUrl !== undefined) s.streamUrl = streamUrl
  if (homepageUrl !== undefined) s.homepageUrl = homepageUrl
  persist(username)
  return { ...s }
}

/**
 * 移除 removeRadioStation 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param id 原业务标识。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export function removeRadioStation(username: string, id: string): boolean {
  const stations = load(username)
  const idx = stations.findIndex(x => x.id === id)
  if (idx < 0) return false
  stations.splice(idx, 1)
  persist(username)
  return true
}

