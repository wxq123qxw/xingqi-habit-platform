/**
 * 数据备份 / 恢复（Module 09 · 后端数据安全）
 *
 * 设计：
 *   - 导出：扫描当前用户的所有 localStorage 数据 → 加密 → 下载 .hbf 文件
 *   - 导入：上传 .hbf → 校验 → 解密 → 写回 localStorage
 *
 * 加密方案（防止备份文件泄露）：
 *   - 用户输入"备份密码"（必须，可以和登录密码不同）
 *   - 用 PBKDF2 从密码派生 AES key + HMAC key（per-backup 随机 salt）
 *   - AES-GCM 加密 + HMAC-SHA256 签名
 *
 * 备份文件格式（.hbf = habit backup format）：
 * ```json
 * {
 *   "version": 1,
 *   "appName": "habit-platform",
 *   "userId": "L!3aZ9bN?x",
 *   "nickname": "小李",
 *   "createdAt": 1738000000000,
 *   "salt": "<hex 16 bytes>",
 *   "iv": "<hex 12 bytes>",
 *   "hmac": "<hex>",
 *   "ciphertext": "<base64>"
 * }
 * ```
 *
 * 注意：
 *   - 备份密码和登录密码独立（即使登录密码弱，备份文件也安全）
 *   - 导入时需要输入备份密码才能解密
 *   - 备份文件包含**所有用户数据**：users 表、habits、checkins、friendships、requests
 */

import {
  deriveKey,
  randomSaltHex,
  randomIvHex,
  encryptString,
  decryptString,
  hmacSignHex,
  hmacVerify,
} from './crypto';

// ============================================================
// 常量
// ============================================================

const BACKUP_VERSION = 1;
const BACKUP_APP_NAME = 'habit-platform';
const BACKUP_MAGIC = 'HBF1'; // file magic for sanity check

// ============================================================
// 类型
// ============================================================

export interface BackupPayload {
  /** 用户的全部 localStorage 数据（按 key → JSON string） */
  entries: Record<string, string>;
  /** 备份时间戳 */
  createdAt: number;
}

export interface BackupEnvelope {
  version: number;
  appName: string;
  magic: string;
  userId: string;
  nickname: string;
  createdAt: number;
  salt: string;     // PBKDF2 salt
  iv: string;       // AES-GCM IV
  hmac: string;     // HMAC of ciphertext (for integrity)
  ciphertext: string; // base64
}

export type ImportResult =
  | { ok: true; entries: Record<string, string>; userId: string; nickname: string }
  | { ok: false; reason: 'parse_failed' | 'wrong_password' | 'wrong_app' | 'wrong_version' | 'integrity_failed' };

// ============================================================
// 收集数据（导出时）
// ============================================================

/**
 * 收集当前用户的全部 localStorage 数据
 * - user 表（跨用户共享）
 * - 当前用户的 habits/checkins/absent
 * - 好友关系（跨用户共享）
 */
export function collectUserData(_userId: string): BackupPayload {
  const entries: Record<string, string> = {};
  if (typeof window === 'undefined') return { entries, createdAt: Date.now() };

  // 收集所有 key（habit-platform-* 前缀的），跳过设备 secret 等
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (key === 'habit-platform-device-secret') continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }

  return { entries, createdAt: Date.now() };
}

// ============================================================
// 加密打包（导出）
// ============================================================

/**
 * 加密 payload → envelope
 *
 * @param payload 要备份的数据
 * @param password 备份密码（用于 PBKDF2 派生 key）
 * @param userId / nickname 备份元信息
 */
export async function encryptBackup(
  payload: BackupPayload,
  password: string,
  userId: string,
  nickname: string
): Promise<BackupEnvelope> {
  const salt = randomSaltHex();
  const iv = randomIvHex();

  // 派生 AES key + HMAC key
  const aesKey = await deriveKey(password, salt, 'key');
  const macKey = await deriveKey(password, salt, 'mac');

  // 加密 payload
  const plaintext = JSON.stringify(payload);
  const { ciphertext } = await encryptString(plaintext, aesKey, iv);

  // HMAC 签名（对 ciphertext 签）
  const hmac = await hmacSignHex(ciphertext, macKey);

  return {
    version: BACKUP_VERSION,
    appName: BACKUP_APP_NAME,
    magic: BACKUP_MAGIC,
    userId,
    nickname,
    createdAt: payload.createdAt,
    salt,
    iv,
    hmac,
    ciphertext,
  };
}

// ============================================================
// 解密校验（导入）
// ============================================================

/**
 * 解密 envelope → payload
 *
 * 校验顺序：
 *   1. JSON parse
 *   2. magic / appName / version
 *   3. HMAC 签名（防篡改）
 *   4. AES-GCM 解密（密码错误会抛错）
 */
export async function decryptBackup(
  envelope: BackupEnvelope,
  password: string
): Promise<BackupPayload> {
  if (envelope.magic !== BACKUP_MAGIC) {
    throw new Error('wrong_magic');
  }
  if (envelope.appName !== BACKUP_APP_NAME) {
    throw new Error('wrong_app');
  }
  if (envelope.version !== BACKUP_VERSION) {
    throw new Error('wrong_version');
  }

  // 派生 key
  const aesKey = await deriveKey(password, envelope.salt, 'key');
  const macKey = await deriveKey(password, envelope.salt, 'mac');

  // HMAC 校验
  const macOk = await hmacVerify(envelope.ciphertext, envelope.hmac, macKey);
  if (!macOk) {
    throw new Error('integrity_failed');
  }

  // AES-GCM 解密（密码错会抛错 → 上层捕获）
  const plaintext = await decryptString(envelope.ciphertext, envelope.iv, aesKey);
  return JSON.parse(plaintext) as BackupPayload;
}

/**
 * 安全解析 + 解密：把任意输入（文件内容字符串 / 已解析对象）转成 BackupPayload
 */
export async function parseAndDecryptBackup(
  raw: string | object,
  password: string
): Promise<BackupPayload> {
  let envelope: BackupEnvelope;
  try {
    envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('parse_failed');
  }
  return decryptBackup(envelope, password);
}

// ============================================================
// 文件下载 / 上传（DOM 工具）
// ============================================================

/**
 * 把 envelope 转成 .hbf 文件并触发浏览器下载
 */
export function downloadBackupFile(envelope: BackupEnvelope): void {
  if (typeof document === 'undefined') return;
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habit-platform-backup-${envelope.nickname}-${new Date(envelope.createdAt).toISOString().slice(0, 10)}.hbf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 用户选择文件后，读取内容为字符串
 */
export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsText(file);
  });
}

// ============================================================
// 导入恢复（写回 localStorage）
// ============================================================

export interface RestoreResult {
  ok: boolean;
  reason?: string;
  entryCount: number;
}

/**
 * 把 BackupPayload 的 entries 写回 localStorage
 *
 * 警告：覆盖当前所有数据！调用前应该确认用户意图
 */
export function restoreFromPayload(payload: BackupPayload): RestoreResult {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'no_window', entryCount: 0 };
  }
  try {
    let count = 0;
    for (const [key, value] of Object.entries(payload.entries)) {
      window.localStorage.setItem(key, value);
      count++;
    }
    return { ok: true, entryCount: count };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'unknown',
      entryCount: 0,
    };
  }
}