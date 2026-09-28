/**
 * 加密备份调度器（Module 09）
 *
 * 流程：
 *   1. 用 SQLite 内置 backup API 把内存数据库 dump 为 Buffer
 *   2. 用 AES-256-GCM 加密（key 从 BACKUP_PASSWORD 派生，PBKDF2 + 随机 salt + IV）
 *   3. HMAC-SHA256 签名（防篡改）
 *   4. 写到 backend/backups/<timestamp>.hbf
 *   5. 写入 backups 表（id / createdAt / sizeBytes / rowCount）
 *
 * 触发：
 *   - 服务启动时立即备份一次
 *   - 然后每 N 小时（默认 6 小时）定时备份
 *
 * 安全：
 *   - BACKUP_PASSWORD 来自环境变量（不硬编码）
 *   - 没有正确密码无法解出备份文件
 *   - 备份包含**所有用户数据**（用户表 / 习惯 / 好友 / 打卡 / 通知 / 缺勤记录）
 *
 * 恢复：
 *   - 通过 routes/backup.cjs 的 POST /api/backups/:id/restore
 *   - 验证 HMAC → 解密 → 关闭 db → 用解密的 db 文件替换 → 重启服务
 */

const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR } = require('./db.cjs');
const {
  deriveKey,
  randomSaltHex,
  randomIvHex,
  encryptBuffer,
  decryptBuffer,
  hmacSignHex,
  hmacVerify,
  bufferToHex,
  hexToBuffer,
  bufferToBase64,
  base64ToBuffer,
} = require('./crypto.cjs');

// Module 09 安全加固：备份统一放在 DATA_DIR/backups/，与 .db 同目录
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}
const BACKUP_INTERVAL_MS = (() => {
  const h = Number(process.env.BACKUP_INTERVAL_HOURS ?? '6');
  return Number.isFinite(h) && h > 0 ? h * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
})();
/** 保留最近 N 个备份（默认 30） */
const BACKUP_KEEP_COUNT = (() => {
  const n = Number(process.env.BACKUP_KEEP_COUNT ?? '30');
  return Number.isFinite(n) && n > 0 ? n : 30;
})();
const BACKUP_MAGIC = 'HBF1';
const BACKUP_VERSION = 2; // v2:增加 retention + fileName 在 metadata 里

/**
 * 备份当前数据库 → 加密写文件
 * 返回 { id, file, sizeBytes, rowCount } 或抛错
 */
async function runBackup() {
  const password = process.env.BACKUP_PASSWORD;
  if (!password) {
    throw new Error('BACKUP_PASSWORD 环境变量未设置，无法生成加密备份');
  }

  // SQLite 内置 backup API（module:sqlite 提供 backup() 但 DatabaseSync 没暴露）
  // 用 VACUUM INTO 'file' 是另一种方式；或者直接拷贝 .db 文件
  // 简单方案：checkpoint + 拷贝 .db 文件
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const dbPath = path.join(DATA_DIR, 'habit.db');
  const dbBuffer = fs.readFileSync(dbPath);

  // 加密
  const salt = randomSaltHex();
  const iv = randomIvHex();
  const aesKey = deriveKey(password, salt, 'aes');
  const macKey = deriveKey(password, salt, 'hmac');
  const { ciphertext } = encryptBuffer(dbBuffer, aesKey, iv);
  const hmac = hmacSignHex(ciphertext.toString('base64'), macKey);

  // 文件名 = 时间戳
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `habit-backup-${stamp}.hbf`;
  const filePath = path.join(BACKUPS_DIR, fileName);

  // 包络（明文 metadata + 密文）
  const envelope = {
    version: BACKUP_VERSION,
    magic: BACKUP_MAGIC,
    appName: 'habit-platform',
    createdAt: now.getTime(),
    sizeBytes: dbBuffer.length,
    salt,
    iv,
    hmac,
    ciphertext: ciphertext.toString('base64'),
  };
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2));
  const fileSize = fs.statSync(filePath).size;

  // 写表（统计行数）
  const rowCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n +
                   db.prepare('SELECT COUNT(*) AS n FROM habits').get().n +
                   db.prepare('SELECT COUNT(*) AS n FROM check_ins').get().n +
                   db.prepare('SELECT COUNT(*) AS n FROM friendships').get().n;

  const info = db.prepare(`
    INSERT INTO backups (created_at, size_bytes, encrypted_path, row_count, status, note)
    VALUES (?, ?, ?, ?, 'ok', ?)
  `).run(now.getTime(), fileSize, filePath, rowCount, `auto backup @ ${stamp}`);

  console.log(`[backup] ✓ ${fileName} (${(fileSize/1024).toFixed(1)} KB, ${rowCount} rows)`);

  // 清理超出保留数量的旧备份（删除文件 + 删表行）
  pruneOldBackups();

  return { id: info.lastInsertRowid, file: filePath, sizeBytes: fileSize, rowCount };
}

/**
 * 保留最近 BACKUP_KEEP_COUNT 个备份，超出的删除文件 + 删表行
 * Module 09 安全加固：防止备份累积无限增长
 */
function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('habit-backup-') && f.endsWith('.hbf'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { name: f, mtime: stat.mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const toDelete = files.slice(BACKUP_KEEP_COUNT);
  for (const item of toDelete) {
    const filePath = path.join(BACKUPS_DIR, item.name);
    try {
      fs.unlinkSync(filePath);
      // 同步删除数据库记录
      db.prepare('DELETE FROM backups WHERE encrypted_path = ?').run(filePath);
      console.log(`[backup] pruned old backup: ${item.name}`);
    } catch (e) {
      console.error(`[backup] failed to prune ${item.name}:`, e.message);
    }
  }
}

/**
 * 启动定时器
 */
function startScheduler() {
  // 启动后等 5 秒再跑第一次（让服务先稳）
  setTimeout(() => {
    runBackup().catch((e) => console.error('[backup] initial failed:', e.message));
  }, 5000);
  setInterval(() => {
    runBackup().catch((e) => console.error('[backup] scheduled failed:', e.message));
  }, BACKUP_INTERVAL_MS);
}

/**
 * 列出所有备份
 */
function listBackups() {
  return db.prepare(`
    SELECT id, created_at AS createdAt, size_bytes AS sizeBytes,
           encrypted_path AS encryptedPath, row_count AS rowCount, note
    FROM backups ORDER BY created_at DESC
  `).all();
}

/**
 * 恢复指定备份
 * 1. 读 .hbf
 * 2. 校验 HMAC
 * 3. 解密得到 .db buffer
 * 4. 关闭 db，替换 .db，重启（实际上 Express 不能简单重启，让调用方决定）
 */
async function restoreBackup(id) {
  const password = process.env.BACKUP_PASSWORD;
  if (!password) throw new Error('BACKUP_PASSWORD 未设置');

  const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (!row) throw new Error('backup_not_found');
  const filePath = row.encrypted_path;
  if (!fs.existsSync(filePath)) throw new Error('file_missing');

  const env = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (env.magic !== BACKUP_MAGIC) throw new Error('wrong_magic');
  if (env.appName !== 'habit-platform') throw new Error('wrong_app');
  if (env.version !== BACKUP_VERSION) throw new Error('wrong_version');

  const aesKey = deriveKey(password, env.salt, 'aes');
  const macKey = deriveKey(password, env.salt, 'hmac');
  const macOk = hmacVerify(env.ciphertext, env.hmac, macKey);
  if (!macOk) throw new Error('integrity_failed');

  const ciphertextBuf = base64ToBuffer(env.ciphertext);
  const dbBuffer = decryptBuffer(ciphertextBuf, env.iv, aesKey);

  // 写盘：先备份当前 .db 到 .bak，再替换
  const dbPath = path.join(DATA_DIR, 'habit.db');
  const bakPath = path.join(DATA_DIR, `habit-${Date.now()}.bak.db`);
  fs.copyFileSync(dbPath, bakPath);
  fs.writeFileSync(dbPath, dbBuffer);

  // 关闭 db（让 DatabaseSync 关闭，下次 query 会重连；或要求重启进程）
  db.close();

  return { restoredFrom: filePath, replacedWith: bakPath };
}

module.exports = {
  runBackup,
  startScheduler,
  listBackups,
  restoreBackup,
  BACKUPS_DIR,
};