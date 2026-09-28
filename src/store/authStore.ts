/**
 * 登录态管理（mock 后端版本）
 *
 * 安全模型：
 * - 注册：昵称 + 密码 → 生成唯一 ID → 存密码 SHA-256 哈希
 * - 登录：昵称 + 密码 → 在用户表查昵称 → 验证密码哈希 → 成功
 * - ID 是公开标识符，用于加好友；密码是私有凭证
 * - 密码哈希：SHA-256（前端 demo 简化版，真后端会用 bcrypt + salt）
 *
 * 数据存储：
 * - habit-platform-user      当前登录态
 * - habit-platform-users     已注册用户表（含 passwordHash）
 *
 * API：
 * - getCurrentUser                       读取当前登录态
 * - registerUserWithPassword             注册（含密码哈希）
 * - loginByCredentials                   登录（验证昵称+密码）
 * - logout                               退出（保留用户表）
 * - findUserById                         查 ID（加好友用）
 * - debugResetAuth                       清掉所有登录态 + 用户表
 *
 * 注：模块 07 真后端上线后，本文件所有方法改为调接口。
 */

const STORAGE_KEY = 'habit-platform-user';
const USERS_KEY = 'habit-platform-users';

export interface CurrentUser {
  id: string;             // 唯一 ID（公开，用于加好友）
  nickname: string;       // 昵称（公开，登录用）
  passwordHash: string;   // 密码 PBKDF2-HMAC-SHA256 派生 hash（私有）
  passwordSalt: string;   // PBKDF2 salt（per-user，防止彩虹表）
  /**
   * Module 09：旧用户迁移标识
   * - 缺省 / 'sha256' = 旧 SHA-256 hash（需要升级到 PBKDF2）
   * - 'pbkdf2' = 已升级
   */
  hashAlgo?: 'sha256' | 'pbkdf2';
  createdAt: number;      // 创建时间
}

/* ============================================================
 * 密码哈希（Module 09 · PBKDF2 + per-user salt）
 * ============================================================ */

import {
  randomSaltHex,
  passwordHashHex as pbkdf2HashHex,
  verifyPasswordHash as pbkdf2VerifyHash,
} from '../utils/crypto';
import { authApi } from '../api/endpoints';
import { setAuthToken, clearAuthToken } from '../api/client';

/**
 * Module 09：把任意 password hash 成 hex 字符串
 *
 * - 如果 hashAlgo === 'sha256'（旧用户）：用老的 SHA-256 单向 hash（保持兼容）
 * - 否则：用 PBKDF2（需要 salt）
 *
 * 注意：调用方需要保证传入正确的 salt
 */
async function legacySha256HashHex(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 派生 PBKDF2 hash + 随机 salt
 * 返回 { hash, salt }，注册时使用
 */
export async function hashPasswordWithSalt(
  password: string
): Promise<{ hash: string; salt: string }> {
  const salt = randomSaltHex();
  const hash = await pbkdf2HashHex(password, salt);
  return { hash, salt };
}

/**
 * 校验密码
 * - 用户有 passwordSalt → PBKDF2
 * - 用户只有 passwordHash（无 salt）→ 旧 SHA-256（兼容旧账号）
 */
async function verifyUserPassword(user: CurrentUser, plain: string): Promise<boolean> {
  if (user.passwordSalt && user.hashAlgo !== 'sha256') {
    return pbkdf2VerifyHash(plain, user.passwordSalt, user.passwordHash);
  }
  // 旧账号 fallback
  const legacy = await legacySha256HashHex(plain);
  return legacy === user.passwordHash;
}

/**
 * Module 09：升级旧 SHA-256 账号到 PBKDF2（透明迁移）
 * - 登录成功后检测 hashAlgo
 * - 如果是 sha256：用旧 hash 校验通过后，用新 PBKDF2 重写 passwordHash + passwordSalt
 * - 这样所有旧账号第一次登录后自动升级，下次登录用 PBKDF2
 */
async function upgradeUserHashIfLegacy(user: CurrentUser, plain: string): Promise<void> {
  if (user.passwordSalt && user.hashAlgo === 'pbkdf2') return; // 已是新版
  // 验证旧 hash 通过后才升级
  const legacy = await legacySha256HashHex(plain);
  if (legacy !== user.passwordHash) return;
  // 派生 + 写回
  const salt = randomSaltHex();
  const newHash = await pbkdf2HashHex(plain, salt);
  user.passwordHash = newHash;
  user.passwordSalt = salt;
  user.hashAlgo = 'pbkdf2';
  const users = readUsersTable();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx !== -1) {
    users[idx] = user;
    writeUsersTable(users);
  }
}

/* ============================================================
 * localStorage 读写
 * ========================================================== */

function readUsersTable(): CurrentUser[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is CurrentUser =>
        u &&
        typeof u.id === 'string' &&
        typeof u.nickname === 'string' &&
        typeof u.passwordHash === 'string' &&
        typeof u.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

function writeUsersTable(users: CurrentUser[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/* ============================================================
 * 订阅机制（Phase 6）
 * - login/logout/registerUserWithPassword/loginByCredentials/updateNickname/updatePassword
 *   任何一个写操作后调用 notifyAuthChange()
 * - App.tsx 订阅后强制重新读取 currentUser → 触发相关 useEffect reload habits
 * ========================================================== */

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

export function subscribeAuth(fn: AuthListener): () => void {
  authListeners.add(fn);
  return () => {
    authListeners.delete(fn);
  };
}

function notifyAuthChange() {
  authListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('auth listener error', e);
    }
  });
}

/* ============================================================
 * 公共 API
 * ========================================================== */

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CurrentUser;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.nickname !== 'string' ||
      typeof parsed.passwordHash !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function login(user: CurrentUser): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  notifyAuthChange();
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  clearAuthToken();
  notifyAuthChange();
}

/** 在用户表里查 ID（加好友时用，不校验密码） */
export function findUserById(id: string): CurrentUser | null {
  const users = readUsersTable();
  return users.find((u) => u.id === id) ?? null;
}

/** 在用户表里查昵称（登录前先看用户是否存在） */
export function findUserByNickname(nickname: string): CurrentUser | null {
  const users = readUsersTable();
  return users.find((u) => u.nickname === nickname) ?? null;
}

/* ============================================================
 * 注册 / 登录（带密码）
 * ========================================================== */

export type RegisterResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: 'empty' | 'too_long' | 'weak_password' | 'nickname_taken' };

/**
 * 注册新用户：昵称 + 密码 → 生成唯一 ID → 哈希密码 → 写登录态 + 用户表
 *
 * 错误码：
 * - empty          昵称为空
 * - too_long       昵称超过 20 字符
 * - weak_password  密码不足 6 字符
 * - nickname_taken 昵称已被占用（demo 简化：要求昵称唯一）
 */
/**
 * Module 09：注册 / 登录 / 改密码 — 优先调后端 API，失败降级 localStorage
 *
 * API 成功 → 缓存 token + 把后端返回的 user 写进 localStorage 兼容读
 * API 失败（NETWORK_ERROR） → 走 localStorage 路径
 * API 业务错误 → 直接返回 reason（昵称占用 / 密码错等）
 */

/**
 * 把 user 写入 localStorage users 表（覆盖已存在）
 * - 让 UI 仍能从 findUserById / getCurrentUser 读到（向后兼容）
 * - passwordHash / passwordSalt 留空（API 才是权威）
 */
function upsertLocalUser(user: CurrentUser): void {
  const users = readUsersTable();
  const idx = users.findIndex((u) => u.id === user.id);
  const row: CurrentUser = {
    ...user,
    passwordHash: user.passwordHash || '',
    passwordSalt: user.passwordSalt || '',
    hashAlgo: user.hashAlgo ?? 'pbkdf2',
  };
  if (idx === -1) users.push(row);
  else users[idx] = row;
  writeUsersTable(users);
}

async function tryApiRegister(input: { nickname: string; password: string }) {
  try {
    const res = await authApi.register(input);
    setAuthToken(res.token);
    return { ok: true as const, user: res.user };
  } catch (e) {
    const err = e as { code?: string; error?: string };
    if (err.code === 'NETWORK_ERROR') {
      return { ok: false as const, networkError: true };
    }
    return { ok: false as const, networkError: false, apiError: err.error };
  }
}

export async function registerUserWithPassword(input: {
  nickname: string;
  password: string;
}): Promise<RegisterResult> {
  const nickname = input.nickname.trim();
  const password = input.password;

  if (!nickname) return { ok: false, reason: 'empty' };
  if (nickname.length > 20) return { ok: false, reason: 'too_long' };
  if (!isValidPassword(password)) {
    return { ok: false, reason: 'weak_password' };
  }

  // 主路径：API
  const apiResult = await tryApiRegister({ nickname, password });
  if (apiResult.ok) {
    const userRow: CurrentUser = {
      id: apiResult.user.id,
      nickname: apiResult.user.nickname,
      passwordHash: '',
      passwordSalt: '',
      hashAlgo: 'pbkdf2',
      createdAt: apiResult.user.createdAt,
    };
    upsertLocalUser(userRow);
    const finalUser = findUserById(userRow.id) ?? userRow;
    login(finalUser);
    return { ok: true, user: finalUser };
  }
  if (!apiResult.networkError) {
    const reasonMap: Record<string, 'empty' | 'too_long' | 'weak_password' | 'nickname_taken'> = {
      empty: 'empty',
      too_long: 'too_long',
      weak_password: 'weak_password',
      nickname_taken: 'nickname_taken',
    };
    const reason = reasonMap[apiResult.apiError ?? ''] ?? 'empty';
    return { ok: false, reason };
  }

  // Fallback：API 不可达 → localStorage
  if (findUserByNickname(nickname)) {
    return { ok: false, reason: 'nickname_taken' };
  }
  const { hash: passwordHash, salt: passwordSalt } = await hashPasswordWithSalt(password);
  const newUser: CurrentUser = {
    id: generateUserId(),
    nickname,
    passwordHash,
    passwordSalt,
    hashAlgo: 'pbkdf2',
    createdAt: Date.now(),
  };
  const users = readUsersTable();
  users.push(newUser);
  writeUsersTable(users);
  login(newUser);
  return { ok: true, user: newUser };
}

export type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: 'empty' | 'not_found' | 'wrong_password' | 'network_error' };

/**
 * 登录：昵称 + 密码 → 用户表查昵称 → 校验哈希
 *
 * 错误码：
 * - empty           昵称或密码为空
 * - not_found       昵称不存在
 * - wrong_password  密码错误
 */
export async function loginByCredentials(input: {
  nickname: string;
  password: string;
}): Promise<LoginResult> {
  const nickname = input.nickname.trim();
  const password = input.password;

  if (!nickname || !password) return { ok: false, reason: 'empty' };

  // 主路径：API
  try {
    const res = await authApi.login(input);
    setAuthToken(res.token);
    // 同步到 localStorage（向后兼容读）
    const userRow: CurrentUser = {
      id: res.user.id,
      nickname: res.user.nickname,
      passwordHash: '',
      passwordSalt: '',
      hashAlgo: 'pbkdf2',
      createdAt: res.user.createdAt,
    };
    upsertLocalUser(userRow);
    const finalUser = findUserById(userRow.id) ?? userRow;
    login(finalUser);
    return { ok: true, user: finalUser };
  } catch (e) {
    const err = e as { code?: string; error?: string };
    if (err.code !== 'NETWORK_ERROR') {
      // 业务错误：not_found / wrong_password
      return { ok: false, reason: (err.error ?? 'unknown') as 'empty' };
    }
  }

  // Fallback：API 不可达 → localStorage
  const user = findUserByNickname(nickname);
  if (!user) return { ok: false, reason: 'not_found' };

  // Module 09：API 注册的账号本地 passwordHash=''（后端剔除敏感字段后只回 PublicUser）
  // 如果 fallback 走到这种账号,本地永远 verify 不过 —— 这种应该报"网络错误"而不是"密码错误"
  if (!user.passwordHash || !user.passwordSalt) {
    return { ok: false, reason: 'network_error' };
  }

  const ok = await verifyUserPassword(user, password);
  if (!ok) return { ok: false, reason: 'wrong_password' };

  // Module 09：透明升级旧 SHA-256 hash 到 PBKDF2
  await upgradeUserHashIfLegacy(user, password);

  login(user);
  return { ok: true, user };
}

/* ============================================================
 * ID 生成（重新引入，保持模块独立）
 * ========================================================== */

const SPECIAL =
  '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pickRandom(pool: string): string {
  return pool.charAt(Math.floor(Math.random() * pool.length));
}

function generateUserId(): string {
  const chars: string[] = [];
  for (let i = 0; i < 3; i++) chars.push(pickRandom(SPECIAL));
  for (let i = 0; i < 3; i++) chars.push(pickRandom(DIGITS));
  for (let i = 0; i < 4; i++) chars.push(pickRandom(LETTERS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * "特殊字符"识别 — 全 ASCII 可打印非字母数字字符
 * 范围段：
 *   - 0x21-0x2F  感叹号-斜杠  ! " # $ % & ' ( ) * + , - .
 *   - 0x3A-0x40  冒号-艾特号  : ; < = > ? @
 *   - 0x5B-0x60  左中括号-反引号  [ \ ] ^ _ `
 *   - 0x7B-0x7E  左花括号-波浪号  { | } ~
 * 合计 32 个字符，覆盖键盘上所有 ASCII 标点。
 * （不含空格 0x20、不含字母数字、不含中文/全角/emoji — 由 asciiOnly 过滤）
 */
// prettier-ignore
const SPECIAL_REGEX = /[!-/:;<=>?@\[-^_`{|}~]/;

/** ID 格式校验：长度 ≥ 6 且至少包含 特殊字符、数字、字母 三类 */
export function isValidUserId(id: string): boolean {
  if (!id || id.length < 6) return false;
  const hasSpecial = SPECIAL_REGEX.test(id);
  const hasDigit = /\d/.test(id);
  const hasLetter = /[a-zA-Z]/.test(id);
  return hasSpecial && hasDigit && hasLetter;
}

/**
 * 密码格式校验：与 ID 规则一致
 * - 至少 6 位
 * - 同时包含：字母、数字、特殊符号（SPECIAL_REGEX 全集 32 字符）
 */
export function isValidPassword(password: string): boolean {
  if (!password || password.length < 6) return false;
  const hasSpecial = SPECIAL_REGEX.test(password);
  const hasDigit = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  return hasSpecial && hasDigit && hasLetter;
}

/* ============================================================
 * 调试
 * ========================================================== */

export function debugResetAuth(): void {
  logout();
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(USERS_KEY);
  }
}

/* ============================================================
 * 改昵称 / 改密码（Tab 4 设置调用）
 * ========================================================== */

export type UpdateNicknameResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: 'empty' | 'too_long' | 'nickname_taken' | 'no_change' };

/** 改昵称：同时更新登录态和用户表 */
export function updateNickname(
  currentUser: CurrentUser,
  newNickname: string
): UpdateNicknameResult {
  const trimmed = newNickname.trim();

  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > 20) return { ok: false, reason: 'too_long' };
  if (trimmed === currentUser.nickname) return { ok: false, reason: 'no_change' };
  // 检查昵称唯一性（排除自己）
  const conflict = readUsersTable().find(
    (u) => u.nickname === trimmed && u.id !== currentUser.id
  );
  if (conflict) return { ok: false, reason: 'nickname_taken' };

  const updated: CurrentUser = { ...currentUser, nickname: trimmed };

  // 更新用户表（保留位置）
  const users = readUsersTable().map((u) =>
    u.id === currentUser.id ? updated : u
  );
  writeUsersTable(users);

  // 更新登录态
  login(updated);

  return { ok: true, user: updated };
}

export type UpdatePasswordResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: 'empty' | 'wrong_old' | 'weak_password' | 'same_as_old' };

/**
 * 改密码：校验旧密码 + 设置新密码哈希
 * - 旧密码错误：返回 wrong_old
 * - 新密码格式不合法：返回 weak_password
 * - 新密码 == 旧密码：返回 same_as_old（避免无意义修改）
 */
export async function updatePassword(
  currentUser: CurrentUser,
  oldPassword: string,
  newPassword: string
): Promise<UpdatePasswordResult> {
  if (!oldPassword || !newPassword) return { ok: false, reason: 'empty' };

  // 验证旧密码（PBKDF2 + 兼容旧 SHA-256）
  const oldOk = await verifyUserPassword(currentUser, oldPassword);
  if (!oldOk) return { ok: false, reason: 'wrong_old' };

  // 新密码格式
  if (!isValidPassword(newPassword)) return { ok: false, reason: 'weak_password' };

  // 新旧密码相同（用 PBKDF2 验证新密码是否等于旧 hash）
  const sameAsOld = await pbkdf2VerifyHash(
    newPassword,
    currentUser.passwordSalt || '',
    currentUser.passwordHash
  );
  if (sameAsOld) return { ok: false, reason: 'same_as_old' };

  // Module 09：派生新 PBKDF2 hash + 新 salt
  const { hash: newHash, salt: newSalt } = await hashPasswordWithSalt(newPassword);
  const updated: CurrentUser = {
    ...currentUser,
    passwordHash: newHash,
    passwordSalt: newSalt,
    hashAlgo: 'pbkdf2',
  };

  const users = readUsersTable().map((u) =>
    u.id === currentUser.id ? updated : u
  );
  writeUsersTable(users);
  login(updated);

  return { ok: true, user: updated };
}