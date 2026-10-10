-- 管理服务独立数据库；作者 yahyaoo。
-- 记录字段统一使用 snake_case，扩展值保留全部原 JSON 字段与顺序。
CREATE TABLE IF NOT EXISTS storage_document (
  table_name TEXT NOT NULL,
  document_key TEXT NOT NULL,
  value_kind TEXT NOT NULL CHECK (value_kind IN ('array', 'object', 'value', 'text')),
  original_text TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  present INTEGER NOT NULL CHECK (present IN (0, 1)),
  PRIMARY KEY (table_name, document_key)
);

-- 服务实例标识；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_server_info (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_server_info_order ON admin_server_info (document_key, sort_order);

-- 管理用户；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_user (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_user_order ON admin_user (document_key, sort_order);

-- 用户配对设备；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_device (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_device_order ON admin_device (document_key, sort_order);

-- 第三方音源注册元数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_source (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_source_order ON admin_source (document_key, sort_order);

-- 用户音源启用状态；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_source_state (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_source_state_order ON admin_source_state (document_key, sort_order);

-- 用户音源优先级；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_source_order (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_source_order_order ON admin_source_order (document_key, sort_order);

-- 全局服务配置；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_config (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_config_order ON admin_config (document_key, sort_order);

-- 定时任务执行记录；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_task_record (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_task_record_order ON admin_task_record (document_key, sort_order);

-- 管理扩展兼容数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS admin_legacy_document (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_legacy_document_order ON admin_legacy_document (document_key, sort_order);

