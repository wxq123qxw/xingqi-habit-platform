/**
 * 星启后端（Module 09）
 *
 * Express + node:sqlite（Node 22.5+ 内置,零 native 依赖）
 *
 * 端口：3001（默认）
 *
 * 路由：
 *   /api/auth/*         注册 / 登录 / 改密码 / me
 *   /api/habits/*       习惯 CRUD + 打卡 + 恢复 + 彻底删除
 *   /api/friends/*      好友关系 + 申请
 *   /api/friends/requests/*
 *   /api/leaderboard    努力值排行榜
 *   /api/backups/*      加密备份管理
 *   /api/health         健康检查
 *
 * 启动：
 *   npm start            # node --experimental-sqlite src/server.cjs
 *   npm run dev          # --watch 模式
 *
 * 环境变量：
 *   PORT                 端口（默认 3001）
 *   BACKUP_PASSWORD      备份加密密码 + token 签名密钥（**必填,后端拒绝启动**）
 *   BACKUP_INTERVAL_HOURS  备份间隔小时数（默认 6）
 *   BACKUP_KEEP_COUNT    保留最近几个备份（默认 30）
 *   RATE_LIMIT_PER_MINUTE  每 IP 每分钟请求数（默认 60）
 *   ALLOWED_ORIGINS      逗号分隔的 CORS 白名单 origin（默认 vite dev + Electron）
 */

const express = require('express');
const cors = require('cors');
const { db } = require('./db.cjs');
const { router: authRouter } = require('./routes/auth.cjs');
const habitsRouter = require('./routes/habits.cjs');
const { friendsRouter, requestsRouter } = require('./routes/friends.cjs');
const leaderboardRouter = require('./routes/leaderboard.cjs');
const backupRouter = require('./routes/backup.cjs');
const { startScheduler } = require('./backup.cjs');
const { rateLimitMiddleware, startJanitor } = require('./ratelimit.cjs');

// ============================================================
// 【Module 09 安全加固】启动前强制检查 BACKUP_PASSWORD
// 同时用作 token 签名密钥 —— 没有它既无法备份也无法签发合法 token
// ============================================================
if (!process.env.BACKUP_PASSWORD) {
  console.error('========================================================');
  console.error('[backend] ✗ BACKUP_PASSWORD 未设置,拒绝启动');
  console.error('         用于:① 加密备份  ② token 签名密钥');
  console.error('         启动前请先设置(随机且长度不限,例如≥8 位):');
  console.error('         PowerShell: $env:BACKUP_PASSWORD = "YourSecret123"');
  console.error('         bash:        export BACKUP_PASSWORD="YourSecret123"');
  console.error('========================================================');
  process.exit(1);
}
const TOKEN_SECRET = process.env.BACKUP_PASSWORD;
console.log('[backend] ✓ BACKUP_PASSWORD 已设置（用于加密备份 + token 签名）');

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

// 让 Express 信任本机代理头（req.ip 准确）
app.set('trust proxy', false); // 仅接受直连的 127.0.0.1 / ::1

// ============================================================
// 【Module 09 安全加固】CORS 白名单
// 支持两种匹配：
//   1. 完全相等（如 http://localhost:5173）
//   2. 前缀匹配 ——白名单项以 '.' 结尾（如 file://.  匹配 file://、file:///app）
// ============================================================
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ??
  'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,app://.,file://.'
).split(',').map((s) => s.trim()).filter(Boolean);
console.log('[backend] CORS whitelist:', ALLOWED_ORIGINS.join(', '));

/**
 * 判断 origin 是否在白名单里
 * - 完全相等 ✓
 * - 白名单项以 '.' 结尾 → 该项去掉 '.' 后用前缀匹配 origin
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // 同源 / 无 Origin 头允许（curl、Electron 主进程）
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // 前缀通配：以 '.' 结尾的项，去掉 '.' 做 startsWith 匹配
  for (const entry of ALLOWED_ORIGINS) {
    if (entry.endsWith('.') && origin.startsWith(entry.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      console.warn(`[cors] blocked origin: ${origin}`);
      // CORS 拒绝应该是 403 (Forbidden)，不是 500（错误）
      // 但 cors 库对拒绝 origin 走 callback(new Error) — express 默认返回 500
      // 为了安全语义清晰，直接用 403 让客户端能看到
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }),
);

// ============================================================
// 通用中间件
// ============================================================

app.use(express.json({ limit: '1mb' }));

// 简单请求日志
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.url}`);
  next();
});

// 【Module 09 安全加固】频率限制（放在业务路由前）
app.use('/api', rateLimitMiddleware);

// ============================================================
// 健康检查（不计入频率限制）
// ============================================================

app.get('/api/health', (_req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    res.json({ ok: true, ts: Date.now(), users: userCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// 业务路由
// ============================================================

app.use('/api/auth', authRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/friends/requests', requestsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/backups', backupRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', method: req.method, url: req.url });
});

// 全局错误处理
app.use((err, _req, res, _next) => {
  // CORS 拒绝 → 403；其他 → 500
  const isCors = /not allowed by CORS/i.test(err.message ?? '');
  if (isCors) {
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  console.error('[error]', err.stack ?? err.message);
  res.status(500).json({ error: err.message ?? 'internal_error' });
});

// ============================================================
// 启动
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] SQLite at: ${require('./db.cjs').DB_FILE}`);
  console.log('[backend] ✓ BACKUP_PASSWORD 已设置,启动定时加密备份 + rate limit');
  startScheduler();
  startJanitor(); // rate limit bucket janitor
});