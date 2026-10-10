/** 浏览器歌单仓储接口，服务不访问管理域。 @author yahyaoo */
export interface BrowserStoragePort {
  /** 获取账号与设备作用域的文档。 */
  get(key: string): unknown
  /** 替换完整歌单对象。 */
  replace(key: string, value: Record<string, unknown>): void
  /** 删除完整文档。 */
  remove(key: string): void
}

/** 浏览器存储业务服务，控制器只处理 HTTP 与认证。 @author yahyaoo */
export class BrowserStorageService {
  /** @param repository 仅具备播放器文档能力的仓储。 */
  constructor(private readonly repository: BrowserStoragePort) {}
  /** @param key 已校验账号设备作用域。 @returns 缓存对象或空值。 */
  get(key: string): unknown { return this.repository.get(key) }
  /** @param key 已校验作用域。 @param value 原歌单。 @throws Error 格式不是对象时拒绝。 */
  replace(key: string, value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('歌单数据必须为对象')
    this.repository.replace(key, value as Record<string, unknown>)
  }
  /** @param key 当前作用域。 */
  remove(key: string): void { this.repository.remove(key) }
}

