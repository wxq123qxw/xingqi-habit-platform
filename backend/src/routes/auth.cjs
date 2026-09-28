/**
 * Auth 路由（注册 / 登录 / 改密码）
 *
 * POST /api/auth/register   { nickname, password } → { user, token }
 * POST /api/auth/login      { nickname, password } → { user, token }
 * POST /api/auth/password   { token, oldPassword, newPassword } → { user }
 * GET  /api/auth/me         (auth) → { user }
 *
 * 安全（Module 09 加固）：
 * - 返回 user 时剔除 passwordHash / passwordSalt（敏感）
 * - token = HMAC-SHA256 签名后的 userId（不可伪造）
 *   格式：base64url(userId).base64url(expiresAt).base64url(signature)
 *   secret = BACKUP_PASSWORD
 *   默认 30 天过期
 * - 每次请求 Header 带 `Authorization: Bearer <token>`
 *
 * 【breaking change】旧 token（plain userId）在重启后端后会失效
 * 客户端用 sessionStorage 存 token，关浏览器即清，下次访问会重新登录
 */

const express = require('express');
const { db } = require('../db.cjs');
const {
  randomSaltHex,
  passwordHashHex,
  verifyPasswordHash,
  signToken,
  verifyToken,
} = require('../crypto.cjs');

const router = express.Router();

/**
 * token 签名密钥
 * - server.cjs 启动前会强制要求 BACKUP_PASSWORD，所以这里一定能拿到
 * - 失败 fallback：拿不到就抛错，要求用户重启服务
 */
function getTokenSecret() {
  const s = process.env.BACKUP_PASSWORD;
  if (!s) {
    throw new Error('BACKUP_PASSWORD 未设置 —— token 签发需要它。请重启后端。');
  }
  return s;
}

// 特殊字符 + 数字 + 字母（与前端 authStore.ts 同源）
const SPECIAL = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pickRandom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateUserId() {
  const chars = [];
  for (let i = 0; i < 3; i++) chars.push(pickRandom(SPECIAL));
  for (let i = 0; i < 3; i++) chars.push(pickRandom(DIGITS));
  for (let i = 0; i < 4; i++) chars.push(pickRandom(LETTERS));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function isValidPassword(p) {
  if (!p || p.length < 6) return false;
  if (p.length > 64) return false;
  // 至少包含字母 + 数字 + 特殊符号
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasDigit = /\d/.test(p);
  const specialRegex = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
  const hasSpecial = specialRegex.test(p);
  // 不能包含中文 / 空格 / 全角
  const asciiOnly = /^[\x21-\x7E]+$/.test(p);
  return hasLetter && hasDigit && hasSpecial && asciiOnly;
}

/**
 * 把 DB row 转成对外的 user 对象（剔除密码 hash）
 */
function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    createdAt: row.created_at,
  };
}

// ============================================================
// 中间件：解析 Bearer token → req.user（Module 09 安全加固）
//
// 流程：
//   1. 拿到 Authorization: Bearer <token>
//   2. verifyToken(token) → 校验 HMAC 签名 + 过期时间
//   3. 用签名里的 userId 查 DB，确认用户存在
//   4. 把 public user 写到 req.user
//
// 失败原因：
//   - unauthorized        header 缺失 / 格式错
//   - invalid_token       签名错（伪造 / secret 改了）
//   - token_expired       过期（>30 天）
//   - user_not_found      签名合法但 userId 不在 DB（理论上不应该出现）
// ============================================================

function requireAuth(req, res, next) {
  const auth = req.get('Authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/.exec(auth);
  if (!m) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const token = m[1];

  let secret;
  try {
    secret = getTokenSecret();
  } catch (e) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const v = verifyToken(token, secret);
  if (!v.ok) {
    const code =
      v.reason === 'expired' ? 'token_expired'
      : v.reason === 'malformed' ? 'unauthorized'
      : 'invalid_token'; // invalid_signature
    return res.status(401).json({ error: code });
  }

  const row = db.prepare('SELECT id, nickname, created_at FROM users WHERE id = ?').get(v.userId);
  if (!row) return res.status(401).json({ error: 'user_not_found' });

  req.user = toPublicUser(row);
  // 也存原始 token 过期时间（业务路由可能想看）
  req.tokenExpiresAt = v.expiresAt;
  next();
}

// ============================================================
// 路由
// ============================================================

router.post('/register', (req, res) => {
  const { nickname, password } = req.body ?? {};
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'empty_nickname' });
  }
  const trimmed = nickname.trim();
  if (trimmed.length === 0 || trimmed.length > 20) {
    return res.status(400).json({ error: 'invalid_nickname' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'weak_password' });
  }

  // 检查昵称唯一
  const exists = db.prepare('SELECT 1 FROM users WHERE nickname = ?').get(trimmed);
  if (exists) {
    return res.status(409).json({ error: 'nickname_taken' });
  }

  // 创建
  const id = generateUserId();
  const salt = randomSaltHex();
  const hash = passwordHashHex(password, salt);
  const createdAt = Date.now();

  db.prepare(`
    INSERT INTO users (id, nickname, password_hash, password_salt, hash_algo, created_at)
    VALUES (?, ?, ?, ?, 'pbkdf2', ?)
  `).run(id, trimmed, hash, salt, createdAt);

  const user = toPublicUser({ id, nickname: trimmed, created_at: createdAt });
  const { token } = signToken(user.id, getTokenSecret());
  res.json({ user, token });
});

router.post('/login', (req, res) => {
  const { nickname, password } = req.body ?? {};
  if (!nickname || !password) {
    return res.status(400).json({ error: 'empty' });
  }
  const row = db.prepare(`
    SELECT id, nickname, password_hash, password_salt, hash_algo, created_at
    FROM users WHERE nickname = ?
  `).get(nickname.trim());
  if (!row) return res.status(404).json({ error: 'not_found' });

  const ok = verifyPasswordHash(password, row.password_salt, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'wrong_password' });

  const { token } = signToken(row.id, getTokenSecret());
  res.json({ user: toPublicUser(row), token });
});

router.post('/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'empty' });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'weak_password' });
  }

  const row = db.prepare(`
    SELECT id, nickname, password_hash, password_salt, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const oldOk = verifyPasswordHash(oldPassword, row.password_salt, row.password_hash);
  if (!oldOk) return res.status(401).json({ error: 'wrong_old' });

  const sameAsOld = verifyPasswordHash(newPassword, row.password_salt, row.password_hash);
  if (sameAsOld) return res.status(400).json({ error: 'same_as_old' });

  const newSalt = randomSaltHex();
  const newHash = passwordHashHex(newPassword, newSalt);
  db.prepare(`
    UPDATE users SET password_hash = ?, password_salt = ?, hash_algo = 'pbkdf2'
    WHERE id = ?
  `).run(newHash, newSalt, req.user.id);

  res.json({ user: toPublicUser({ ...row, created_at: row.created_at }) });
});

/** 当前用户（验证 token 用） */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = { router, requireAuth };