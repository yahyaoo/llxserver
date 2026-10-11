import WebDavClient from './WebDavClient'

/** 远程备份接口：对应用公开能力，隐藏 webdav 包与连接实现。 @author yahyaoo */
export interface WebDavGateway extends Pick<WebDavClient, keyof WebDavClient> {}

/** @param config 原 WebDAV 配置。 @param dataPath 独立数据根目录。 @returns 原备份能力实例。 */
export function createWebDavGateway(config: Partial<ConstructorParameters<typeof WebDavClient>[0]>, dataPath: string): WebDavGateway {
  return new WebDavClient({ ...config, url: config.url || '', username: config.username || '', password: config.password || '' }, dataPath)
}
