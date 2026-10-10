-- 管理服务独立数据库；作者 yahyaoo。
-- 记录字段统一使用 snake_case，扩展值保留全部原 JSON 字段与顺序。
CREATE TABLE IF NOT EXISTS server_storage_document (
  table_name TEXT NOT NULL, -- 所属业务表名
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  value_kind TEXT NOT NULL CHECK (value_kind IN ('array', 'object', 'value', 'text')), -- 文档类型：数组、对象、标量或原始文本
  original_text TEXT NOT NULL, -- 完整原始文本，用于保留格式与兼容导出
  modified_at INTEGER NOT NULL, -- 文档最后修改时间，Unix 毫秒
  byte_length INTEGER NOT NULL, -- 原始文本 UTF-8 字节数
  present INTEGER NOT NULL CHECK (present IN (0, 1)), -- 有效标记：1 有效，0 已删除且禁止重新导入
  PRIMARY KEY (table_name, document_key)
);

-- 服务实例标识；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_server_info (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_server_info_order ON server_server_info (document_key, sort_order);

-- 管理用户；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_user (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_user_order ON server_user (document_key, sort_order);

-- 用户配对设备；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_device (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_device_order ON server_device (document_key, sort_order);

-- 第三方音源注册元数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_source (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_source_order ON server_source (document_key, sort_order);

-- 用户音源启用状态；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_source_state (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_source_state_order ON server_source_state (document_key, sort_order);

-- 用户音源优先级；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_source_order (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_source_order_order ON server_source_order (document_key, sort_order);

-- 全局服务配置；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_config (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_config_order ON server_config (document_key, sort_order);

-- 定时任务执行记录；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_task_record (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_task_record_order ON server_task_record (document_key, sort_order);

-- 管理扩展兼容数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS server_legacy_document (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_server_legacy_document_order ON server_legacy_document (document_key, sort_order);


-- 登录会话：启动时自动补建；到期时间使用 Unix 毫秒，远程令牌用会话密钥加密。
CREATE TABLE IF NOT EXISTS server_login_session (
  token_hash TEXT PRIMARY KEY, -- 浏览器令牌的 SHA-256 摘要
  username TEXT NOT NULL, -- 登录账号
  created_at INTEGER NOT NULL, -- 登录时间
  expires_at INTEGER NOT NULL, -- 到期时间
  credential_hash TEXT NOT NULL, -- 本地账号凭据摘要，用于密码修改后撤销
  remote_url TEXT, -- 所选远程服务器地址
  remote_token TEXT -- 加密的远程会话令牌
);
CREATE INDEX IF NOT EXISTS idx_server_login_session_expiry ON server_login_session (expires_at);

-- 用户 API Token 总开关，账号名称与现有用户配置关联。
CREATE TABLE IF NOT EXISTS server_api_token_account (
  username TEXT PRIMARY KEY, -- 关联登录账号
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)) -- 账号令牌认证总开关
);
-- API Token 使用摘要检索；原值按账号凭据加密，供本人管理及复制。
CREATE TABLE IF NOT EXISTS server_api_token (
  token_hash TEXT PRIMARY KEY, -- 令牌摘要
  username TEXT NOT NULL REFERENCES server_api_token_account(username) ON DELETE CASCADE, -- 令牌所属账号
  token_encrypted TEXT NOT NULL, -- 使用账号凭据密钥加密的令牌
  name TEXT NOT NULL, -- 用户设置的令牌名称
  created_at INTEGER NOT NULL, -- 创建时间，毫秒
  expires_at INTEGER, -- 到期时间，空值表示永久
  last_used INTEGER, -- 最近访问时间，毫秒
  disabled INTEGER NOT NULL CHECK (disabled IN (0, 1)) -- 单个令牌禁用标志
);
CREATE INDEX IF NOT EXISTS idx_server_api_token_user ON server_api_token (username);
