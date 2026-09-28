/**
 * 后端加密工具（Node.js 版本）
 *
 * 与前端 src/utils/crypto.ts 同样的密码学原语，但用 Node crypto：
 *   - PBKDF2-HMAC-SHA256 (密码 → hash)
 *   - AES-256-GCM (数据加密)
 *   - HMAC-SHA256 (完整性签名)
 *
 * 为什么不在后端共享前端 crypto.ts：
 *   - Node 没 Web Crypto API（用 node:crypto）
 *   - 跨环境（Web Crypto vs Node crypto）维护同一份逻辑易出错
 *   - 后端加密可以用 Node crypto 的同步 API，更直白
 */

const { webcrypto } = require('node:crypto');
const crypto = require('node:crypto');

// ============================================================
// 常量
// ============================================================

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'sha256';
const AES_KEY_BITS = 256;
const AES_IV_BYTES = 12;
const HMAC_BITS = 256;

// ============================================================
// 编码工具
// ============================================================

function bufferToHex(buf) {
  return buf.toString('hex');
}

function hexToBuffer(hex) {
  return Buffer.from(hex, 'hex');
}

function bufferToBase64(buf) {
  return buf.toString('base64');
}

function base64ToBuffer(b64) {
  return Buffer.from(b64, 'base64');
}

// ============================================================
// 随机数
// ============================================================

function randomSaltHex() {
  return crypto.randomBytes(16).toString('hex');
}

function randomIvHex() {
  return crypto.randomBytes(AES_IV_BYTES).toString('hex');
}

// ============================================================
// PBKDF2
// ============================================================

/**
 * 派生 AES key（或 HMAC key）
 *
 * @param {string} password
 * @param {string} saltHex
 * @param {'aes'|'hmac'} usage
 * @returns {Buffer} 派生 key bytes
 */
function deriveKey(password, saltHex, usage = 'aes') {
  const salt = hexToBuffer(saltHex);
  const iterations = PBKDF2_ITERATIONS;
  const keylen = AES_KEY_BITS / 8;
  return crypto.pbkdf2Sync(password, salt, iterations, keylen, PBKDF2_HASH);
}

/**
 * 密码 → hex hash（用 HMAC 派生避免直接用 hash 作为输出）
 */
function passwordHashHex(password, saltHex) {
  const key = deriveKey(password, saltHex, 'hmac');
  const sig = crypto.createHmac('sha256', key).update('habit-platform-password-v1').digest();
  return bufferToHex(sig);
}

function verifyPasswordHash(password, saltHex, expectedHashHex) {
  const computed = passwordHashHex(password, saltHex);
  if (computed.length !== expectedHashHex.length) return false;
  // 时间常数比较
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// AES-GCM
// ============================================================

function encryptString(plaintext, key, ivHex) {
  const iv = ivHex ? hexToBuffer(ivHex) : crypto.randomBytes(AES_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: bufferToBase64(Buffer.concat([ciphertext, authTag])),
    iv: bufferToHex(iv),
  };
}

function decryptString(ciphertextB64, ivHex, key) {
  const iv = hexToBuffer(ivHex);
  const combined = base64ToBuffer(ciphertextB64);
  // 最后 16 字节是 auth tag
  const ciphertext = combined.subarray(0, combined.length - 16);
  const authTag = combined.subarray(combined.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
  return plaintext;
}

// ============================================================
// HMAC
// ============================================================

function hmacSignHex(data, key) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function hmacVerify(data, sigHex, key) {
  const computed = hmacSignHex(data, key);
  return computed === sigHex;
}

// ============================================================
// Token 签名（Module 09 安全加固）
//
// 用 HMAC-SHA256(userId.expiresAt, secret) 签发不可伪造的 token。
//
//   token = base64url(userId) + '.' + base64url(expiresAt) + '.' + base64url(signature)
//
// 安全模型：
//   - 攻击者拿到 token 也不能伪造过期时间或换 userId（无 secret）
//   - 校验时同时验：① 签名正确 ② 没过期
//   - 不存服务端（无状态），重启后端不踢用户
//   - 用 base64url 而不是标准 base64（避开 URL 不安全字符 + 不需 padding）
// ============================================================

const TOKEN_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

/** Buffer → base64url（无 padding，URL 安全） */
function bufferToBase64Url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** base64url → Buffer（自动补 padding） */
function base64UrlToBuffer(s) {
  // 补 padding 到 4 倍数
  const pad = (4 - (s.length % 4)) % 4;
  const padded = s + '='.repeat(pad);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * 签发 token
 *
 * @param {string} userId
 * @param {string} secret   签名密钥（用 BACKUP_PASSWORD）
 * @param {number} [ttlMs]  有效期（默认 30 天）
 * @returns {{ token: string, expiresAt: number }}
 */
function signToken(userId, secret, ttlMs = TOKEN_DEFAULT_TTL_MS) {
  if (!userId) throw new Error('signToken: userId required');
  if (!secret) throw new Error('signToken: secret required');
  const expiresAt = Date.now() + ttlMs;
  const part1 = bufferToBase64Url(Buffer.from(userId, 'utf8'));
  const part2 = bufferToBase64Url(Buffer.from(String(expiresAt), 'utf8'));
  const payload = `${part1}.${part2}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest();
  const part3 = bufferToBase64Url(sig);
  return {
    token: `${payload}.${part3}`,
    expiresAt,
  };
}

/**
 * 校验 token 签名 + 过期
 *
 * @param {string} token
 * @param {string} secret
 * @returns {{ ok: true, userId: string, expiresAt: number }
 *          | { ok: false, reason: 'malformed'|'invalid_signature'|'expired' }}
 */
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
  if (!secret) return { ok: false, reason: 'invalid_signature' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [part1, part2, part3] = parts;

  // 重新计算签名
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${part1}.${part2}`, 'utf8')
    .digest();
  const expectedB64Url = bufferToBase64Url(expected);

  // 时间常数比较（防 timing attack）
  if (expectedB64Url.length !== part3.length) {
    return { ok: false, reason: 'invalid_signature' };
  }
  let diff = 0;
  for (let i = 0; i < expectedB64Url.length; i++) {
    diff |= expectedB64Url.charCodeAt(i) ^ part3.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false, reason: 'invalid_signature' };

  // 解析 userId + expiresAt
  let userId, expiresAtNum;
  try {
    const idBuf = base64UrlToBuffer(part1);
    userId = idBuf.toString('utf8');
    const expBuf = base64UrlToBuffer(part2);
    expiresAtNum = Number(expBuf.toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!userId || !Number.isFinite(expiresAtNum)) {
    return { ok: false, reason: 'malformed' };
  }

  // 过期检查
  if (Date.now() >= expiresAtNum) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, userId, expiresAt: expiresAtNum };
}

// ============================================================
// 备份专用：加密整个 SQLite dump（buffer → buffer）
// ============================================================

function encryptBuffer(plaintext, key, ivHex) {
  const iv = ivHex ? hexToBuffer(ivHex) : crypto.randomBytes(AES_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ciphertext, authTag]),
    iv: iv.toString('hex'),
  };
}

function decryptBuffer(ciphertextBuf, ivHex, key) {
  const iv = hexToBuffer(ivHex);
  const ciphertext = ciphertextBuf.subarray(0, ciphertextBuf.length - 16);
  const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = {
  // 编码
  bufferToHex,
  hexToBuffer,
  bufferToBase64,
  base64ToBuffer,
  bufferToBase64Url,
  base64UrlToBuffer,
  // 随机
  randomSaltHex,
  randomIvHex,
  // PBKDF2
  deriveKey,
  passwordHashHex,
  verifyPasswordHash,
  // AES-GCM
  encryptString,
  decryptString,
  encryptBuffer,
  decryptBuffer,
  // HMAC
  hmacSignHex,
  hmacVerify,
  // Token 签名（Module 09 安全加固）
  signToken,
  verifyToken,
  TOKEN_DEFAULT_TTL_MS,
};