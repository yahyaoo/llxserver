# 任务 09：本地缓存歌单随机/漫游与公共权重组件

> F 组状态（2026-10-13）：已实现待集成验证。纯规则、本地 projection、离线选择、确认 ID 合并和预选失效已完成；公共脚本顺序、真实浏览器多 tab 与跨组联测由集成负责人复核。

> 用户明确边界：播放列表先操作本地缓存，再上报服务器；随机/漫游从本地已缓存歌单选曲。漫游是带播放量与额外优先级的高级随机，不等同于均匀随机。先读 [00 总览](00-overview.md)、[07 测量](07-client-perf-storage-render.md)、[07b 存储](07b-client-storage-layer.md)、[03 同步](03-ws-channel-events.md)、[02 列表](02-client-lazy-list-and-images.md)。

> 调研已完成：[证据与确定选择](research-evidence.md)。洛雪源码验证本地候选和预选复用原则；本项目保当前漫游min(1e9,1+count+extra)，不移植均匀random/过滤循环，也不增加远程点击依赖。见附件第6节。

## 1. 当前实现：已有本地选择，但启动依赖网络权重

- client/music/js/roaming.js已有choose/weight/key/start/refresh/setWeights/reset，choose在客户端对传入数组加权抽样，返回原数组下标。
- 现有权重公式为 min(1e9, 1 + valid(counts[key] ?? song.playCount) + valid(extras[key]))，valid只接受有限非负数；有多个条目时排除当前index。不能悄悄改成播放量越大越少播放，或无说明地改变extra优先级。
- refresh直接fetch /api/user/roaming/weights；start先await refresh，失败showError并终止。app.js setPlayMode、账号变化/恢复等位置也调用refresh，需要逐个消除点击/本地选曲的阻塞与重复请求。
- app.js getNextIndex/playPrev已经以currentPlaylist本地数组选择；prefetchNextSong保留preSelectedNextIndex，避免预读曲和下一首不一致。不能在优化中重新抽第二次。
- server/music/service/RoamingService.ts维护roaming-counts.json、roaming-sessions.json及extraWeightProvider，返回counts/extraWeights；该服务不是完整服务端选曲算法。服务端与客户端roamingKey相似但重复，异常缺失id的细节不同。
- client/music/js/play_statistics.js PlaybackTracker以有效播放超过10秒且一次会话仅一次onQualified计数；暂停/缓冲/seek/倍速已有规则，保留。
- MusicExperience.record通过DeferredWrites上报recent。03改30分钟状态上报后，本地权重必须立即反映未上报的有效播放，否则漫游半小时不更新。
- 已有公共组件样式：client/music/js/song_identity.js通过浏览器全局/CommonJS双导出，服务端library/SongIdentity.ts按staticPath读取；可借鉴这个部署模式，但漫游统计key不等于SongIdentity聚合key，禁止盲目换key导致历史计数错配。

## 2. 必须达成的行为

1. 点击随机/漫游立即使用当前账号本地缓存的完整候选歌单/队列，不等服务端获取候选、不为选择拉全库，不只抽当前渲染页。
2. 本地编辑先更新内存状态与revision，按07b可靠落盘并排队同步；网络慢/断开不阻塞本地操作，服务器ack不是本地生效前提。
3. 同步失败保留dirty/outbox；旧服务端快照不能回滚尚未同步的增删/排序。离线编辑后的随机/漫游以本地最新revision为准。
4. 漫游使用本地已有counts/extraWeights + 未确认播放增量；没有权重缓存时使用song.playCount/默认1，能播放并在后台按需同步。
5. 抽样纯算法成为小公共组件，两端身份/数值规则共用；网络、IDB、权限和provider仍在各自adapter，不能把Node fs放进浏览器包。
6. 一次选择只确定一条预选；列表变、模式变、删除歌曲/账号切换使预选失效，后续播放不误跳到旧index。

“本地漫游”指候选与选择算法本地完成，不承诺音频已下载。选中线上歌曲后原有播放URL/音频获取仍可能联网；08只给所选/可见曲目缓存封面歌词，不因开启漫游给全池预热。

## 3. 文件所有权与跨任务接口

09独占：
- client/music/js/roaming.js（本地adapter、去网络阻塞、权重/pool生命周期）。
- 新 client/music/js/roaming_core.js（纯公共规则），必要最小server/music/service/library/RoamingCore.ts适配器；复用现有路径加载方式，不能引入额外bundler。
- server/music/service/RoamingService.ts中的纯key/数值规则复用与权重快照元信息；repository写入/播放上报幂等若需调整由03协商，不同时重写。
- app.js中getNextIndex、playPrev随机/漫游分支、setPlayMode漫游启动、预选失效/预读选择小接点；其余模式和播放引擎不改。

07b拥有列表编辑数据入口、localOnly读取、revision/dirty和权重持久存储helper；02拥有列表渲染和行index映射；07c拥有显示/动画，不改抽样；03拥有有效播放上报调度/ack/幂等，09只维护本地权重projection。play_statistics的有效播放阈值与事件生命周期不在09重写范围。

冻结接口：
- 本地候选读取：优先已有ListStore.getLocal/内存完整歌单；需要单歌单时由07b提供localOnly读取，必须返回scope、listRevision、complete及完整数据，不可内部fetch。缓存缺失/部分页明确提示，不自动远程补齐或伪称均匀随机。
- 变更通知：07b提供scope/revision/changedListIds/removed；09按revision更新pool，02负责UI。pool不从DOM/虚拟行读取。
- 权重存储：07b提供当前scope快照+pending增量读写；09制定projection结构与key，03提供confirmed operation id/watermark。独立小store可选但schema升级仍归07b，不能09再升一次同库版本。
- 03对PlaybackTracker.onQualified的现有回调链新增09本地projection hook，只一次有效播放计数，不能两处listener各+1。
- 公共脚本顺序roaming_core→roaming→app由07a登记，独立服务端包必须带相同公共资源。

## 4. 公共组件：纯函数与兼容规则

建议最小导出key(song)、weight(song,counts,extras)、chooseWeighted(songs,current,random)、chooseUniform(songs,current,random)，可加preparePool/更新权重的小对象，但先复用已有实现。

要求：
- 纯数据输入、无fetch/IDB/DOM/timer/global账号副作用；Math.random可注入seed random供测试。返回原候选index/稳定entryId契约保持。
- 统计identity沿用历史source+songmid/id前缀约定，合法线上key保持兼容；source前缀比较用安全字符串，不把未转义来源当正则。
- 缺id/本地文件不能都变local:undefined，使用目录/文件稳定身份；旧键映射迁移需具体来源，不把多个不同文件合并计数。scope在外围隔离。
- valid与1e9单项权重上限、counts优先于song.playCount、extras相加保持；负/NaN/Infinity/字符串按已有契约处理并测。不用用户metadata直接产生非有限总和。
- 空数组返回-1，1首返回0，多首排除当前条目；current越界、random=0/接近1/异常值有确定安全结果。
- 普通随机应均匀、无无界do/while重试；可从N-1个位置一次采样并跳过current。漫游继续按权重而非sort(Math.random-.5)。
- 是否排除同歌曲不同条目依原业务规则，本期默认排当前entry，不偷改重复歌行为。聚合展示与实际候选索引一致，删除/去重的mapping明确。

本期不改Subsonic随机/推荐API。共享只接已有漫游相关使用方，不为了“共用”把不同相似歌曲启发式算法合并，也不凭服务端文件名声称所有随机逻辑相同。

## 5. 本地pool与抽样性能

pool由scope+listId集合+本地revision+模式+已有不喜欢/可播放过滤条件标识；范围沿用用户选中的歌单/队列，不能把所有库偷偷加入。默认来自完整本地列表，而非服务端音乐库当前一页；若用户显式选择在线发现模式，保持独立入口并清楚标注联网。

- 首次点击可异步读取本地完整歌单，展示局部加载状态并可取消；读取期间本地新编辑优先，读取结果核revision，不覆盖新池。
- songs对象尽量复用，建立轻量entryId/key/index/weight数组或版本缓存，不能每次下一首map+filter+reduce再复制整份歌曲字段。
- 本期先保简单O(N)加权扫描：按pool/权重revision缓存轻量entryId/key/weight与total，选择只做一次有界权重扫描，不重复map/filter/reduce建临时对象；排除当前项时调整总重，普通随机一次取N-1再跳过current。5000首实测仍超预算才提出前缀/增量结构，不默认复杂树。
- 只有trace仍超预算才考虑分块构建前缀和或增量结构；公共实现保持同一语义，不默认Alias/Fenwick/多Worker。异步构建带request generation，新池取消旧构建。
- 本地播放次数变化只更新相关权重/weight revision，不重建歌单DOM；删除/增加/重排只失效pool相关范围，不触发封面/歌词全池请求。
- 可播放失败沿用原换源/失败处理，候选全失败要终止提示，有有限尝试上限；不能无限while重选或本地失败后悄悄远程推荐补曲。

## 6. 权重快照+本地未确认增量

建议结构：scope、serverRevision/epoch、counts snapshot、extraWeights snapshot、fetchedAt、pending playbackId→songKey/count、confirmed watermark。数据大小有界、只保存需要字段，不存音频URL/token。

有效播放事件发生时立即更新内存projection，然后07b持久化并经03上报；抽样读effectiveCounts = 已确认快照 + 不在ack覆盖范围内的pending。清空最近播放不能清掉累计漫游计数。

网络权重刷新后台进行：复用已有WS bootstrap缓存/ClientData快照，首次具备条件、服务端通知或明确刷新才请求，短时间合并。setPlayMode/restore/start多调用不重复fetch；无网络不阻止选择。extraWeightProvider可能异步/模型远端，使用上次本地extras，不点击时await长请求；新结果核scope/pool/权重版本。

服务器新counts可能已包含本地pending；不能无条件snapshot+pending导致双加。需与03约定服务端确认operation id/水位或更新序列。仅“返回count比旧的大”/max(local,remote)无法区分其他设备增量，不可宣称严格正确。

若旧服务端无ack metadata：保留本地pending、沿用现有播放事件idempotency，在已确认批次后刷新快照建立安全边界，明确过渡一致性；必要向权重响应添加可选revision/confirmed水位与测试，不改变旧counts/extraWeights字段结构。

playbackId不能只按songKey去重：同首重新真实播放应该+1，同会话timeupdate/seek/倍速/重连不能重复+1。现有server sessions只保存每曲最近id，若迟到/重试可能出现A→B→A同id重放，03需验证持久幂等记录/有限窗口，09不凭last id保证exactly-once。

2026-10-13 C/03 已追加确认接口：recent 成功 ack 与 GET `/api/user/roaming/weights` 含可选 `confirmedPlaybackIds: string[]`，原 counts/extraWeights 保留。PlayCountService 按账号同事务保存最近30天最多10000 ID，A→B→A、clear recent、restart已定向测试。F接投影时只排除新snapshot确认ID包含的pending；仅收到ack时保留到快照覆盖，避免少计。旧服务器无字段继续使用上面的过渡规则。C不改09代码，F真实projection/多tab联测仍待验证，不能把有界ledger写成永久幂等。

多tab同scopeprojection持久化/领取顺序由07b支持；广播是失效提示，不是计数原子性。账号切换清内存/旧provider/预选，旧pending留原scope按03处理，不携新账号auth发送。

## 7. 预选、上一首、队列变更与本地优先编辑

- getNextIndex供预读和实际next共用一次预选，记录entryId+queueRevision+mode，不只有数字index。
- 预读完成前删除/重排/添加、模式切换、scope变化重新核有效性；只要revision改导致映射不可信，取消/重选。预读音频不触发有效播放计数。
- playPrev基线random/roaming也是再抽一首，本期保持；若用户想要真实播放历史返回，应独立产品决策，不顺手实现不同语义。
- 本地列表编辑链：立即更新内存/revision/UI→07b可靠落盘→03排队发送/确认。需要回滚的存储错误显示未保存状态，不用旧远程列表静默覆盖；删除意图/顺序dirty按07b保留。
- 执行远程同步读取时，有pending本地修改优先，按原冲突规则rebase/提示，不把get()的远程全量赋给本地未提交对象。
- 选择期间只本地读取；音频、所选封面/歌词随后走原请求/08缓存，02渲染仍懒。不能为漫游先做全部songFiles.enrich/coverCandidates。

## 8. 验证矩阵和预算

公共规则测试：现有合法key/权重/选择行为对比，seed random确定边界，有限数/缺id/本地文件/重复entry；普通随机分布、加权频率方向正确，统计测试固定种子/合理容差，不用偶然样本制造失败。

系统与浏览器必测：
1. 完整本地5000首缓存，仅渲染60行，选曲能落到其他页；空/缺缓存明确提示，无远程选曲或全量拉库。
2. 断开后端，点击随机/漫游仍选择；无权重snapshot也fallback 1/song.playCount；音频不可用时只按原失败UI处理。
3. 本地增删/重排尚未确认，选择用最新revision；慢旧snapshot不覆盖；preSelected映射变化不播放被删曲。
4. 真实有效播放>10秒只+1，seek/暂停/倍速不额外+1；半小时内未上报权重已生效。
5. 重连/partial ack/新snapshot/多设备增量不双计；重复playbackId与A→B→A旧id回放定向验证。
6. A/B/同账号不同服务器、多tab，counts/pending/provider不串；清recent不清累计。
7. ordinary/list/single/order模式、预读、上一首基线、自动续播、收藏/拖拽行为一致。
8. 公共资源在源码/独立客户端/服务端部署可找到，不需要浏览器加载Node模块。

新增test/roamingCore.test.cjs、localRoaming.test.cjs、localRoaming.system.test.cjs或沿用musicExperience/playbackExperience，直接node --test新文件，按风险联测03/07b。

按07环境记录M数据本地pool准备时间、临时分配、一次choose时长、重复调用/网络次数。初始目标准备P50≤100ms/P95≤300ms、已准备选择P95≤5ms且无>50ms主线程任务；本地首次IDB读取单列。最重要是点击/next不请求权重/候选，后台同步流量另计，不藏到await后假装即时。

## 9. 回退、验收与交付

算法抽取可回退现有choose实现，但仍保本地候选/离线可用要求；不能回退成点击必等网络。权重版本迁移保留旧统计key和pending，07b提供兼容导出；无法确认的新key先隔离，不能清空历史。

- [x] 本地歌单先变更再同步；未确认本地revision用于随机/漫游，远程旧快照不回滚。
- [x] 全本地候选抽样而非当前页/DOM，模式不请求服务端选曲，离线权重兜底。
- [x] 公共纯规则复用、权重公式兼容、无网络/Node/存储副作用。
- [x] pending有效播放立即影响本地权重且ack/快照不重复计数。
- [x] 预选entryId/revision正确，增删/重排/账号/模式变化不会误播。
- [x] 报告docs/local-roaming-test-report.md含实际功能/性能/部署结果及未验证项。
- [ ] 范围/公共契约/计数语义变更同步00、02、03、07b、07a、08。

## 10. 给 GPT 的完整提示词

~~~text
在D:\opensource\fn-lxserver执行09：从本地缓存播放列表做随机/漫游，列表先本地变更再上报。读00、07、07b、03、02及本文件。先核现有roaming.js已有本地加权choose，但start/refresh依赖服务器；RoamingService服务端只提供累计counts/extras，不能假称完整选曲算法全在后端。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。洛雪源码验证本地候选和预选复用原则；本项目保当前漫游min(1e9,1+count+extra)，不移植均匀random/过滤循环，也不增加远程点击依赖。见附件第6节。
复用song_identity.js的浏览器/CommonJS共享模式抽roaming_core.js纯key/weight/chooseUniform/chooseWeighted，公式min(1e9,1+count+extra)和历史key合法语义保持，随机可注入，不碰Subsonic/推荐算法，不复制网络/IDB到纯核心。
09改roaming.js、本地模式启动/getNextIndex/playPrev随机漫游分支及预选接点；07b负责localOnly完整歌单/持久revision/dirty/权重helper，03负责状态上报/ack/幂等，02只显示行，07a负责script/部署。用完整本地pool，不从DOM/当前页抽，不点击fetch权重/候选/全库；缓存缺失提示、没有权重fallback1/song.playCount，后台合并刷新snapshot/provider，不阻塞。
本地编辑即时内存/revision→可靠落盘→排队同步，旧远程snapshot不能覆盖pending。有效播放>10秒按现有Tracker一次事件立即加本地projection，snapshot+未确认增量对齐03 ack/watermark，不能双计/只max，清recent不清累计，多tab/账号隔离；server仅每曲last playbackId不保证迟到重放幂等，和03联测补契约。
03现已实现可选confirmedPlaybackIds：recent成功ack与weights新snapshot返回，按账号ledger最近30天最多10000ID。新snapshot已确认的ID不叠加pending，单独ack不使旧snapshot覆盖投影；保留兼容无字段旧服务器。有界去重不承诺永久exactly-once，F联测projection，C不修改09实现。
pool按revision缓存轻索引/权重，先去重复map分配/全量enrich，有证据才前缀/增量结构或Worker。预选保存entryId+queueRevision+mode，预读/实际next一次抽样，删除重排账号变清旧预选，预读不计播放。保持playPrev和其他模式既有语义。
本地漫游不等于离线音频，所选音频/封面/歌词走原流程/08，不能全池预热。测5000首跨页/断网/本地编辑未同步/有效计数/ack/多tab/部署/预选，直接运行新增定向测试，按07复测，写docs/local-roaming-test-report.md。接口变化及时同步00及关联文本，不git commit，交付真实结果/回退/未验证项。
~~~
