/**
 * Leaderboard 路由（努力值排行榜）
 *
 * GET /api/leaderboard?userId=xxx
 *   → 返回 { entries: [{ id, nickname, effort, isCurrentUser }] }
 *   - entries 包含"当前用户"+"该用户的所有好友"
 *   - effort 用真人公式：
 *       IF status === 'deleted' → 0
 *       ELSE max(0, check_in_count × difficulty - absent_count)
 *   - sum 后降序 + dense_rank 同分同名
 */

const express = require('express');
const { db } = require('../db.cjs');
const { requireAuth } = require('./auth.cjs');

const router = express.Router();
router.use(requireAuth);

/** 单用户努力值 */
function userEffort(userId) {
  const rows = db.prepare(`
    SELECT check_in_count, absent_count, difficulty, status
    FROM habits WHERE user_id = ?
  `).all(userId);
  let total = 0;
  for (const h of rows) {
    if (h.status === 'deleted') continue;
    const e = Math.max(0, h.check_in_count * h.difficulty - h.absent_count);
    total += e;
  }
  return total;
}

/** dense_rank 同分同名 */
function rankWithTies(entries) {
  const sorted = [...entries].sort((a, b) => b.effort - a.effort);
  const out = [];
  let prevValue = null;
  let prevRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i].effort;
    let rank;
    if (v !== prevValue) {
      rank = i + 1;
      prevValue = v;
      prevRank = rank;
    } else {
      rank = prevRank;
    }
    out.push({ ...sorted[i], rank });
  }
  return out;
}

router.get('/', (req, res) => {
  const currentUserId = req.user.id;

  // 当前用户
  const meRow = db.prepare('SELECT id, nickname FROM users WHERE id = ?').get(currentUserId);
  const entries = [{
    id: currentUserId,
    nickname: meRow?.nickname ?? '你',
    effort: userEffort(currentUserId),
    isCurrentUser: true,
  }];

  // 好友
  const friends = db.prepare(`
    SELECT friend_id AS id, friend_nickname AS nickname, friend_color AS color
    FROM friendships WHERE user_id = ?
  `).all(currentUserId);
  for (const f of friends) {
    entries.push({
      id: f.id,
      nickname: f.nickname,
      color: f.color,
      effort: userEffort(f.id),
      isCurrentUser: false,
    });
  }

  const ranked = rankWithTies(entries).slice(0, 5);
  res.json({ entries: ranked });
});

module.exports = router;