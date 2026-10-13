# 客户端公共通道

客户端公共组件是 `client/music/js/client-channel.js`，发送线程是 `client-channel-worker.js`，服务器装配组件是 `server/application/http/ClientChannel.ts`。原业务接口继续负责权限检查、喜欢规则、歌单保存与最近播放统计。

登录时通过 `GET /api/user/client-bootstrap` 加载账号资料、设置、歌单及音乐库。主界面随后从账号独立的 IndexedDB 缓存读取资料；服务器更新通过 `/api/music/client-channel` 长连接推送。缓存版本避免登录后重复推送同一歌单，小变更按条目保存，播放进度更新不复制整个音乐库。

设置项 `clientSyncTransport` 默认为 `ws`，设置页面的“高级”可以选择 `http`。HTTP 模式仍保留 WS 接收服务器更新；仅客户端上报改用 `POST /api/user/client-sync`。WS 上报无法确认时回退同一个 HTTP 批量接口，两个方式使用相同操作 ID。

`ClientSync` 每 30 秒计算一个批次，只包含最终状态发生变化的通道，设置按字段生成补丁。发送前恢复原值、喜欢后取消和临时歌单新增后删除均不发送。已发送而未确认的状态保留尝试记录，响应丢失后仍可纠正服务器实际状态。

`ClientTransport.report` 把批次写入持久队列，再由 Worker 发送。localStorage 保存账号独立的队列索引，IndexedDB 保存较大的消息正文，界面编辑只等待本地保存。确认成功才清理；临时错误保留失败项，下一周期重试。调用 `ClientTransport.request` 可以让显式下载命令复用同一队列及原接口响应。

长连接通过 `type` 分派 `hello`、`ready`、`report`、`ack`、`cache`、`subscribe`、`downloads`、`sync-download`、`maintenance`、`remaster` 和 `resolve-progress`。身份令牌在第一条消息中提交。下载页面只在显示时订阅进度，离开后取消订阅，共用连接继续接收数据更新。

退出按钮先暂停音频、保存最终进度，确认全部待提交变化后才注销。页面关闭的保活提交受浏览器容量限制，没有收到确认的状态保留在本地，后续进入时恢复。

测试入口是 `npm run test:unit` 和 `npm run test:system`，包括真实 HTTP/WS、SQLite、远程转发、回退、队列恢复、字段差异与最近播放幂等回归。
