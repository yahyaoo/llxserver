/** 用户网络电台服务：校验电台流地址并读写独立用户的电台列表。 @author yahyaoo */
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

/** 用户创建的网络电台，包含标识、名称、流地址和主页。 @author yahyaoo */
export interface RadioStation {
  /** 业务记录标识。 */
  id: string
  /** 记录显示名称。 */
  name: string
  /** 网络电台音频流地址。 */
  streamUrl: string
  /** 网络电台主页地址。 */
  homepageUrl?: string
}

const userCaches = new Map<string, RadioStation[]>()

/**
 * 计算用户自建网络电台的 SQL 文档路径。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
function getUserStoreFile(username: string): string {
  const userPath = (global.lx && global.lx.userPath) || path.join(process.cwd(), 'data', 'users')
  const userDir = path.join(userPath, getUserDirname(username || 'default'))
  return path.join(userDir, 'radioStations.json')
}

/**
 * 读取并缓存用户自建电台文档，缺少文档时返回空列表。
 * @param username 已解析的用户名称。
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
 * 保存用户网络电台列表到播放器数据库。
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
 * 返回指定用户保存的自建网络电台列表。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export function listRadioStations(username: string): RadioStation[] {
  return load(username).map(s => ({ ...s }))
}

/**
 * 按电台标识查询用户电台记录。
 * @param username 已解析的用户名称。
 * @param id 当前业务对象标识。
 * @author yahyaoo
 */
export function getRadioStation(username: string, id: string): RadioStation | null {
  const s = load(username).find(x => x.id === id)
  return s ? { ...s } : null
}

/**
 * 为用户创建电台，保存流地址和可选主页信息。
 * @param username 已解析的用户名称。
 * @param name 对象名称或归档内相对名称。
 * @param streamUrl 电台音频流地址。
 * @param homepageUrl 电台可选主页地址。
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
 * 更新指定用户电台的名称、流地址及主页信息。
 * @param username 已解析的用户名称。
 * @param id 当前业务对象标识。
 * @param name 对象名称或归档内相对名称。
 * @param streamUrl 电台音频流地址。
 * @param homepageUrl 电台可选主页地址。
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
 * 删除用户选定的网络电台记录。
 * @param username 已解析的用户名称。
 * @param id 当前业务对象标识。
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

