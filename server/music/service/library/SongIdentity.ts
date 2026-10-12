import path from 'node:path'
/** 从当前客户端资源读取公共规则，源码与独立部署均使用同一实现。 @author yahyaoo */
export const songIdentity = () => require(path.join(global.lx?.staticPath || path.resolve(__dirname, '../../../../client'), 'music/js/song_identity.js')) as {
  key: (song: any) => string | null
  fileKey: (song: any) => string | null
  aggregate: (songs: any[]) => any[]
  compare: (a: any, b: any) => number
}
