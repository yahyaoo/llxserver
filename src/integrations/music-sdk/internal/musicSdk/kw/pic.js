/** pic 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import { httpFetch } from '../../request.js'
import { formatPic } from './util.js'

export default {
  getPic({ songmid }) {
    const requestObj = httpFetch(`http://artistpicserver.kuwo.cn/pic.web?corp=kuwo&type=rid_pic&pictype=1000&size=1000&rid=${songmid}`)
    requestObj.promise = requestObj.promise.then(({ body }) => /^http/.test(body) ? formatPic(body) : null)
    return requestObj.promise
  },
}
