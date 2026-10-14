# 客户端公共通道

客户端公共组件是 `client/music/js/client-channel.js`，发送线程是 `client-channel-worker.js`，服务器装配组件是 `server/application/http/ClientChannel.ts`。原业务接口继续负责权限检查、喜欢规则、歌单保存与最近播放统计。

登录时通过 `GET /api/user/client-bootstrap` 加载账号资料、设置、歌单及音乐库。主界面随后从账号独立的 IndexedDB 缓存读取资料；服务器更新通过 `/api/music/client-channel` 长连接推送。缓存版本避免登录后重复推送同一歌单，小变更按条目保存，播放进度更新不复制整个音乐库。

设置项 `clientSyncTransport` 默认为 `ws`，设置页面的“高级”可以选择 `http`。HTTP 模式仍保留 WS 接收服务器更新；仅客户端上报改用 `POST /api/user/client-sync`。WS 上报无法确认时回退同一个 HTTP 批量接口，两个方式使用相同操作 ID。

`ClientSync` 按写入用途安排一次 deadline，空闲没有固定提交定时器。播放状态默认首次 pending 起 30 分钟；用户数据 300ms 防抖、持续编辑最多等待 2 秒；动作命令立即提交。设置按字段生成补丁，恢复原值、喜欢后取消和临时歌单新增后删除不发送。已发送而未确认的状态保留尝试记录，响应丢失后仍可纠正服务器实际状态。

`ClientTransport.report` 把批次写入持久队列，再由 Worker 发送。localStorage 保存账号独立的队列索引，IndexedDB 保存较大的消息正文，界面编辑只等待本地保存。确认成功才清理；临时错误保留失败项，下一周期重试。调用 `ClientTransport.request` 可以让显式下载命令复用同一队列及原接口响应。

长连接通过 `type` 分派 `hello`、`ready`、`report`、`ack`、`cache`、`subscribe`、`downloads`、`downloads:summary`、`library`、`notify`、`sync-download`、`maintenance`、`remaster` 和 `resolve-progress`。身份令牌在第一条消息中提交。下载页面只在显示时订阅详细进度，离开后取消订阅，共用连接继续接收数据更新。

退出按钮先暂停音频、保存最终进度，确认全部待提交变化后才注销。页面关闭的保活提交受浏览器容量限制，没有收到确认的状态保留在本地，后续进入时恢复。

测试入口是 `npm run test:unit` 和 `npm run test:system`，包括真实 HTTP/WS、SQLite、远程转发、回退、队列恢复、字段差异与最近播放幂等回归。

## 写入分类与确认

分类同时检查 HTTP 方法；GET/HEAD 是读取，不进入 report。未知写入属于 data，服务端仍只接收原白名单中的接口，分类不授予调用权限。

| 类别 | 写入接口 | 策略 |
| --- | --- | --- |
| state | POST `/api/user/recent`、POST `/api/music/playback`、PUT `/api/music/storage/playback` | 默认 30 分钟，首次 pending 确定截止时间，后续编辑不延后 |
| command | `/api/music/cache/download`、`/api/music/cache/queue`、queue 的 concurrency/pause/resume/remove、`/api/music/cache/stop`、remaster 的 start/cancel | 写入立即；读取仍走 fetch |
| data | POST `/api/user/list`、favorites、settings、sound-effects、library/artists、library/albums、dislike 及 dislike/library/*、`/api/music/cache/config`、cache/lyric、music/user/list/reorder；PUT user/appearance、user/account、user/sync-download/settings、music/storage/queue | 300ms 防抖，maxWait 2 秒；包括未知写入 |

播放位置是 state，保存整个播放队列是 data，音量等用户设置也是 data。`ClientTransport.request` 的显式写入命令立即入持久 report 队列；延迟有效播放经 DeferredWrites 与 ClientSync 分类调度。09 的选曲不依赖这次上报或网络权重响应。

hidden、online、重连 ready、显式保存/退出登录、切换身份前及 state 条数/字节阈值触发补发尝试。失败只在 pending 存在时继续安排 deadline；data/command 与立即 state 失败至少间隔 5 秒，普通 state 按配置周期重试。成功清空后停止。页面关闭通过认证 fetch keepalive 提交估算不超过 59000 字节的子批次，不能保证实际发送或收到 ack，超限操作留待下次。没有 ack 不删除 pending；退出登录严格 flush 会等待确认落盘。

07b 的 `prepareBatch(name)` 等待持久镜像并领取租约，03 按类别筛选；`ack(events,results,name)` 等待真实落盘，最后 `release(name)`。兼容旧版本同步 collect/ack，不改 07b 存储实现。账号切换后的旧异步响应不能覆盖新账号数据。

远程同步模式保留原歌单 sender，持久事件仍经可代理到远端的 ClientTransport 批次提交，并遵守同一分类周期；单个普通 sender 失败不阻止其他事件的非严格补发。

report 沿用原格式；分批上限采用 ready 的 maxBatchOps/maxBatchBytes，操作 ID 在 HTTP/WS 重试间不变。原服务端硬上限 512 条、24MB 保留；不能用该硬上限替代浏览器 keepalive 限额。

成功的 recent 操作在 ack 中追加可选 `confirmedPlaybackIds`；`GET /api/user/roaming/weights` 同时保留 counts/extraWeights 并追加该字段。服务端按账号在 `client_recent_setting/playback-acknowledgements.json` 保存最近 30 天最多 10000 个 playbackId，和计数同事务，覆盖 A→B→A 迟到重试、清 recent 与重启。有限窗口之外不承诺永久 exactly-once。

F 组应保留本地投影直到新 counts snapshot 已覆盖该 ID；新 snapshot 的 confirmedPlaybackIds 包含的 ID 不再叠加 pending。仅收到 ack 就删投影会在快照仍旧时短暂少计。最近播放预览也排除快照已确认 ID。

确认集合在 getRoamingWeights 同步读取 counts 前捕获，不能在等待异步 extras 后读取新 ledger，否则等待期间新增的播放可能被旧 counts 错误确认。F 后续改变 counts 读取时序时须联动此一致性边界。

## 事件订阅与通知

`hello` 追加 `lastNotifySeq` 和 `serverEpoch`；ready 追加 `config: {reportIntervalMs,progressThrottleMs,maxBatchOps,maxBatchBytes}`、serverEpoch、notifySeq、notifyRange 和 resumeUnavailable。旧 cache/report 字段结构保留。配置保存后在新连接下发；客户端状态间隔可选择跟随服务端、5/30/60 分钟。

全局订阅 downloads:summary 和 library；notify 握手时默认订阅。下载页/维护页可见时才订阅详细主题。订阅先补快照，随后由 ServerEvents 标记 revision，progress 默认 500ms 节流，完成、失败、取消与队列变化立即安排推送。异步旧快照发现 revision 已变化时丢弃，重新取得新快照。close/取消订阅释放对应 timers，实例 close 注销所有监听。

downloads:summary 是 `{active,queued,speed}`；downloads 保留原队列数据并追加 proxyProgress（按用户最多保留 200 个 taskId）。原生代理下载使用真实字节/状态推送，客户端忽略重复、较旧或暂停任务的历史快照。下载页速度按推送字节差计算，完成归零，隐藏不采样；本地下载流仍按真实读取字节更新。library 只含扫描/预取数字摘要和 version，2 万文件 ID 不直接广播。

notify 使用实例全局 seq 和 epoch，普通主题 seq 属于各连接，两者不能混用。每用户保留 100 条、全局公告 50 条，重连最多补 50 条；只返回当前用户和 `*` 公告。重启、旧 cursor、环溢出通过 resumeUnavailable 表明缺口，不能补回已丢失通知。客户端按服务器 origin + 账号保存小 cursor 对象（含 epoch），最多 5 秒合并写入；内存只留 50 条，消息正文转义后交 toast，非法链接丢弃，不提供持久通知中心。

只有可信进程内事件能发布公告，浏览器没有发布入口。上行待处理消息最多 64 条/24MB，远程握手待转发队列同样有界；socket 发送缓冲超过 1MB 关闭 1013，重连获取最新快照。单实例 30 秒协议 ping/pong，两次检查无 pong 清理连接，零连接停计时；这不是业务轮询。

HTTP 上报模式仍接收 WS 推送。WS 真正断开时，只在下载页可见安排 5 秒 HTTP 队列/代理进度兜底，ready、hidden、离页停止。隐藏配置 `clientChannel.legacyProgressPolling=false`，只有显式启用且订阅存在活动任务才每秒补读；用于发现缺失事件源时临时回退，正常事件路径不使用。

全量 custom/list 与 cache/list bootstrap 暂保留，须 A 组确认 01/02 前端消费者均已改用分页后再移除。C 组本次没有宣称完成这项联动。实际测试与边界见 [WS 测试报告](ws-events-test-report.md)。
