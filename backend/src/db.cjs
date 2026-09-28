/**
 * SQLite 数据库（Module 09 · 后端数据存储）
 *
 * 用 Node 22.5+ 内置的 node:sqlite（无需任何 native 依赖）
 *
 * Schema（6 张核心表 + 2 张备份元数据表）：
 * - users               注册用户表（含密码 hash + salt）
 * - habits              习惯表（按 userId 分桶）
 * - check_ins           打卡记录表
 * - friendships         好友关系（双向各一条）
 * - friend_requests     好友申请（pending / accepted / rejected）
 * - notifications       推送通知记录（reminderPushed + reminderAnimated）
 * - backups             备份元数据（id / createdAt / encryptedPath / sizeBytes）
 * - absent_checks       每日缺勤检查时间戳
 *
 * 设计：
 * - 启动时自动建表（CREATE TABLE IF NOT EXISTS）
 * - 用户表跨用户共享（排行榜需要聚合所有用户）
 * - 习惯/打卡按 userId 索引
 * - 所有时间戳 int (epoch ms)
 */

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'habit.db');

// ============================================================
// Schema
// ============================================================

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  nickname        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  hash_algo       TEXT NOT NULL DEFAULT 'pbkdf2',
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  total_days      INTEGER NOT NULL,
  check_in_count  INTEGER NOT NULL DEFAULT 0,
  absent_count    INTEGER NOT NULL DEFAULT 0,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      INTEGER NOT NULL,
  reminder_type   TEXT NOT NULL,
  reminder_time   TEXT NOT NULL,
  difficulty      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_status ON habits(user_id, status);

CREATE TABLE IF NOT EXISTS check_ins (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  date            TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  UNIQUE(habit_id, date),
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_checkins_habit_date ON check_ins(habit_id, date);

CREATE TABLE IF NOT EXISTS friendships (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  friend_id       TEXT NOT NULL,
  friend_nickname TEXT NOT NULL,
  friend_color    TEXT,
  established_at  INTEGER NOT NULL,
  UNIQUE(user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);

CREATE TABLE IF NOT EXISTS friend_requests (
  id                TEXT PRIMARY KEY,
  from_user_id      TEXT NOT NULL,
  from_user_nickname TEXT NOT NULL,
  to_user_id        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        INTEGER NOT NULL,
  resolved_at       INTEGER,
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  user_id         TEXT NOT NULL,
  habit_id        TEXT NOT NULL,
  date            TEXT NOT NULL,
  pushed_at       INTEGER,
  animated_at     INTEGER,
  PRIMARY KEY (user_id, habit_id, date)
);

CREATE TABLE IF NOT EXISTS absent_checks (
  user_id         TEXT PRIMARY KEY,
  last_check_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      INTEGER NOT NULL,
  size_bytes      INTEGER NOT NULL,
  encrypted_path  TEXT NOT NULL,
  row_count       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ok',
  note            TEXT
);
`;

// ============================================================
// 初始化
// ============================================================

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_FILE);
// WAL 模式 = 并发读 + 单写，性能更好
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(SCHEMA);

module.exports = {
  db,
  DB_FILE,
  DATA_DIR,
};