/**
 * 加密原语（Module 09 · 后端数据安全）
 *
 * 用 Web Crypto API 实现：
 *   - PBKDF2：密码 → 强 hash（抵御彩虹表）
 *   - AES-GCM：数据加密/解密（备份文件、敏感字段）
 *   - HMAC-SHA256：localStorage 完整性校验
 *
 * 设计原则：
 *   - 所有加密都用 Web Crypto API（Electron + Web 都支持）
 *   - PBKDF2 100k 迭代（OWASP 推荐）
 *   - AES-GCM 用 96-bit IV + 128-bit auth tag
 *   - salt / IV 每次随机（绝不复用）
 *
 * 注意：
 *   - Web Crypto API 是 async（返回 Promise）
 *   - 旧 SHA-256 单向 hash 不再使用，统一用 PBKDF2
 *
 * 为什么不加密业务数据（habits / friends 等）：
 *   - 业务数据加密需要每次启动输密码 → UX 退化
 *   - HMAC 签名已能发现篡改 → 完整性有保障
 *   - 备份文件用 password 加密 → 备份数据本身安全
 *   - 业务数据明文 + HMAC 已是本地存储的合理折中
 *     （真后端用 TLS + DB 加密才能解生产服务密钥问题）
 */

// ============================================================
// 常量
// ============================================================

const PBKDF2_ITERATIONS = 100_000; // OWASP 2023 推荐
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_BITS = 256;
const AES_IV_BYTES = 12; // 96 bits（GCM 标准）
const HMAC_BITS = 256;

// ============================================================
// 编码工具
// ============================================================

/** ArrayBuffer → hex 字符串 */
function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** hex 字符串 → ArrayBuffer */
function hexToBuffer(hex: string): ArrayBuffer {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

/** ArrayBuffer → base64 字符串 */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** base64 字符串 → ArrayBuffer */
function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ============================================================
// 随机数
// ============================================================

/** 16 字节随机 salt（hex） */
export function randomSaltHex(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bufferToHex(salt.buffer);
}

/** 12 字节随机 IV（hex，GCM 标准） */
export function randomIvHex(): string {
  const iv = new Uint8Array(AES_IV_BYTES);
  crypto.getRandomValues(iv);
  return bufferToHex(iv.buffer);
}

// ============================================================
// PBKDF2（密码 → key / hash）
// ============================================================

/**
 * 把 password + salt 派生为 AES key（或 HMAC key）
 *
 * @param password 用户明文密码
 * @param saltHex hex salt
 * @param usage 'key' 用于 AES 加密 / 'mac' 用于 HMAC
 */
export async function deriveKey(
  password: string,
  saltHex: string,
  usage: 'key' | 'mac' = 'key'
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  if (usage === 'key') {
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: hexToBuffer(saltHex),
        iterations: PBKDF2_ITERATIONS,
        hash: PBKDF2_HASH,
      },
      baseKey,
      { name: 'AES-GCM', length: AES_KEY_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  }
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: hexToBuffer(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: HMAC_BITS },
    false,
    ['sign', 'verify']
  );
}

/**
 * 派生 hash hex（用于密码校验）
 * 实际是 deriveKey + 导出一个随机字节的密文 → 拿密文当 hash
 *
 * 注：直接用 deriveKey + 一个固定 marker 加密得到 hash
 */
export async function passwordHashHex(
  password: string,
  saltHex: string
): Promise<string> {
  const key = await deriveKey(password, saltHex, 'mac');
  // 用 HMAC 对固定字符串签名作为"hash"——目的是与 password 等长无关
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('habit-platform-password-v1'));
  return bufferToHex(sig);
}

export async function verifyPasswordHash(
  password: string,
  saltHex: string,
  expectedHashHex: string
): Promise<boolean> {
  const key = await deriveKey(password, saltHex, 'mac');
  // 把 expectedHash 转回 buffer 比较
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('habit-platform-password-v1'));
  const computedHex = bufferToHex(sig);
  // 时间常数比较（防 timing attack）
  if (computedHex.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// AES-GCM（加密 / 解密）
// ============================================================

/** 加密 plaintext 字符串，返回 base64(ciphertext) 字符串 */
export async function encryptString(
  plaintext: string,
  key: CryptoKey,
  ivHex?: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = ivHex
    ? hexToBuffer(ivHex)
    : (() => {
        const arr = new Uint8Array(AES_IV_BYTES);
        crypto.getRandomValues(arr);
        return arr.buffer;
      })();
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    ciphertext: bufferToBase64(ciphertextBuf),
    iv: bufferToHex(iv),
  };
}

/** 解密 base64(ciphertext)，返回 plaintext 字符串 */
export async function decryptString(
  ciphertextB64: string,
  ivHex: string,
  key: CryptoKey
): Promise<string> {
  const iv = hexToBuffer(ivHex);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBuffer(ciphertextB64)
  );
  return new TextDecoder().decode(buf);
}

// ============================================================
// HMAC（完整性签名）
// ============================================================

/**
 * 给数据签 HMAC（防篡改）
 * @param data 字符串数据
 * @param key HMAC key
 * @returns hex 签名
 */
export async function hmacSignHex(data: string, key: CryptoKey): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bufferToHex(sig);
}

/** 验证 HMAC 签名 */
export async function hmacVerify(
  data: string,
  sigHex: string,
  key: CryptoKey
): Promise<boolean> {
  return crypto.subtle.verify('HMAC', key, hexToBuffer(sigHex), new TextEncoder().encode(data));
}

// ============================================================
// 设备密钥（localStorage 完整性用，跨 userId 复用）
// ============================================================

/**
 * 派生"设备级"HMAC key 用于 localStorage 完整性校验
 * - 不需要用户密码
 * - 但 secret 本身存在 localStorage（如果 user 改 secret，所有签名会失效——这是设计）
 * - 攻击场景：用户主动改 localStorage → 我们能检测到
 *
 * secret 来源：常量 + 启动期随机 suffix 写到 localStorage。
 * 这样 secret 不会硬编码（攻击者改源码不影响），但也不需要用户密码。
 */
const DEVICE_SECRET_KEY = 'habit-platform-device-secret';

/** 取 / 创建设备 secret */
export function getOrCreateDeviceSecret(): string {
  if (typeof window === 'undefined') return '';
  let secret = window.localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    // 16 字节 hex 随机 secret
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    secret = bufferToHex(arr.buffer);
    window.localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

/**
 * 派生 localStorage HMAC key（基于设备 secret + 固定 salt）
 * 整个 App 共享一个 key，所有 localStorage 条目用它签
 */
let _storageMacKeyPromise: Promise<CryptoKey> | null = null;
export function getStorageMacKey(): Promise<CryptoKey> {
  if (_storageMacKeyPromise) return _storageMacKeyPromise;
  const secret = getOrCreateDeviceSecret();
  const salt = 'habit-platform-storage-mac-v1';
  _storageMacKeyPromise = deriveKey(secret, salt, 'mac');
  return _storageMacKeyPromise;
}