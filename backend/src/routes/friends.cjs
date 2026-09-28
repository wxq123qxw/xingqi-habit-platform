/**
 * Friends 路由（好友关系 + 申请）
 *
 * GET  /api/friends                 → 当前用户的好友列表（含对方 habits 数）
 * GET  /api/friends/requests        → 当前用户收到的 pending 申请
 * POST /api/friends/requests        { targetId } → 发起好友申请
 * POST /api/friends/requests/:id/accept
 * POST /api/friends/requests/:id/reject
 * DELETE /api/friends/:friendId     → 解除好友关系（双向删除）
 */

const { db } = require('../db.cjs');
const { requireAuth } = require('./auth.cjs');
const crypto = require('node:crypto');

const friendsRouter = require('express').Router();
const requestsRouter = require('express').Router();

friendsRouter.use(requireAuth);
requestsRouter.use(requireAuth);

// ============================================================
// 发起申请（POST /api/friends/requests）
// ============================================================
requestsRouter.post('/', (req, res) => {
  const { targetId } = req.body ?? {};
  if (!targetId || typeof targetId !== 'string') {
    return res.status(400).json({ error: 'missing_target' });
  }
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'self' });
  }

  // 查对方是否存在
  const target = db.prepare('SELECT id, nickname FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'target_not_found' });

  // 已经是好友？
  const alreadyFriend = db.prepare(
    'SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?'
  ).get(req.user.id, targetId);
  if (alreadyFriend) return res.status(409).json({ error: 'already_friend' });

  // 已申请过？
  const dup = db.prepare(`
    SELECT 1 FROM friend_requests
    WHERE from_user_id = ? AND to_user_id = ?
      AND (status = 'pending' OR status = 'accepted')
  `).get(req.user.id, targetId);
  if (dup) return res.status(409).json({ error: 'already_requested' });

  const id = `req-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(`
    INSERT INTO friend_requests
      (id, from_user_id, from_user_nickname, to_user_id, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(id, req.user.id, req.user.nickname, targetId, Date.now());

  res.json({ ok: true, requestId: id });
});

// 收到的申请列表（pending）
requestsRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, from_user_id AS fromUserId, from_user_nickname AS fromUserNickname,
           to_user_id AS toUserId, status, created_at AS createdAt
    FROM friend_requests
    WHERE to_user_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ requests: rows });
});

// 接受（共享逻辑）
function performAccept(row) {
  db.exec('BEGIN');
  try {
    // 标记 accepted
    db.prepare(`
      UPDATE friend_requests SET status = 'accepted', resolved_at = ?
      WHERE id = ?
    `).run(Date.now(), row.id);

    // 双方都建好友关系
    // 接收方 → 申请人
    db.prepare(`
      INSERT OR IGNORE INTO friendships (user_id, friend_id, friend_nickname, established_at)
      VALUES (?, ?, ?, ?)
    `).run(row.to_user_id, row.from_user_id, row.from_user_nickname, Date.now());
    // 申请人 → 接收方（用真实昵称）
    const receiver = db.prepare('SELECT nickname FROM users WHERE id = ?').get(row.to_user_id);
    db.prepare(`
      INSERT OR IGNORE INTO friendships (user_id, friend_id, friend_nickname, established_at)
      VALUES (?, ?, ?, ?)
    `).run(row.from_user_id, row.to_user_id, receiver?.nickname ?? '未知用户', Date.now());

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 接受（按 requestId 匹配 —— 服务端测试 / 调试用）
requestsRouter.post('/:id/accept', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'not_pending' });
  if (row.to_user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  performAccept(row);
  res.json({ ok: true });
});

/**
 * 接受（按"申请人 ID"匹配 —— 前端 fire-and-forget 路径用）
 *
 * 背景：前端 fire-and-forget 调用 acceptFriendRequest 时,只能用本地 requestId
 *      (`req-${Date.now()}-xxx`),而后端生成的 requestId 是 `req-${hex}`
 *      —— 命名空间不同,后端按 requestId 永远查不到。
 *
 * 修法：让前端传 fromUserId（申请人是哪个 user）,后端按
 *      (from_user_id=fromUserId, to_user_id=当前用户, status='pending') 匹配,
 *      取最新的那条 pending 申请来接受。免去了跨设备 ID 同步问题。
 *
 * 请求：POST /api/friends/requests/accept-from
 *   Body: { fromUserId: string }
 *   响应：{ ok: true } 或 404 not_found
 */
requestsRouter.post('/accept-from', (req, res) => {
  const { fromUserId } = req.body ?? {};
  if (!fromUserId || typeof fromUserId !== 'string') {
    return res.status(400).json({ error: 'missing_from_user_id' });
  }

  // 找"对方发给我"的最新一条 pending 申请
  const row = db.prepare(`
    SELECT * FROM friend_requests
    WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `).get(fromUserId, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  performAccept(row);
  res.json({ ok: true });
});

// 拒绝
requestsRouter.post('/:id/reject', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'not_pending' });
  if (row.to_user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  db.prepare(`
    UPDATE friend_requests SET status = 'rejected', resolved_at = ?
    WHERE id = ?
  `).run(Date.now(), id);
  res.json({ ok: true });
});

// ============================================================
// 好友列表（GET /api/friends）
// ============================================================
friendsRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT friend_id AS friendId, friend_nickname AS friendNickname,
           friend_color AS friendColor, established_at AS establishedAt
    FROM friendships WHERE user_id = ?
    ORDER BY established_at DESC
  `).all(req.user.id);
  res.json({ friends: rows });
});

// 解除好友（双向删）
friendsRouter.delete('/:friendId', (req, res) => {
  const friendId = req.params.friendId;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(req.user.id, friendId);
    db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, req.user.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

module.exports = {
  friendsRouter,
  requestsRouter,
};