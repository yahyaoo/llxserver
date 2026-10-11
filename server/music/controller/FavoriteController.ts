import type { RequestContext } from '../../common/http/RequestContext'
import type { PlaylistServiceRuntime } from '../service/PlaylistService'
import { handleFavorites } from '../service/FavoriteService'

/** 独立喜爱请求入口，权限及歌曲操作交给服务处理。 @author jingyh */
export const favorites = (context: RequestContext, runtime: PlaylistServiceRuntime) => handleFavorites(context, runtime)
