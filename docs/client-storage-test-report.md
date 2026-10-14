# 07b 存储层验证

IDB v2 拆为 `kv/lists/list_meta/events/weights`，scope 为服务器身份与账号的 JSON 复合键；歌单按 id 保存，meta 读取不打开正文。旧 key 迁移按 copy→分批 verify→active，来源保留，可导出最新兼容格式。

验证覆盖中间原地修改、重排、0 写、事务 abort、旧 dirty 不被远程覆盖、复合 scope、两页面旧快照冲突、单歌单目标写、播放队列前一版本、outbox 迁移/租约/部分 ack/新 revision 保留。`node --test test/browserStorage.test.cjs test/deferredWritesIdb.test.cjs test/localStore.test.cjs`：通过。

边界：IDB 不可用时只读 `get()` 尝试在线读取并发出 `client-storage-error`；编辑仍明确失败，不假保存。跨页面冲突需先读取得到 revision，未知基线不会静默覆盖。`putList` 要求 `baseRevision` 或已知 revision。03 调用方需 await `persist()/prepareBatch()/ack()/release()`。
