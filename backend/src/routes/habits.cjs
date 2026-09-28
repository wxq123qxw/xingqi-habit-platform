/**
 * Habits 路由（习惯 CRUD）
 *
 * GET    /api/habits          → 当前用户的所有 habits
 * POST   /api/habits          { name, totalDays, reminderType, reminderTime, color, difficulty }
 * PATCH  /api/habits/:id      { checkInCount?, absentCount?, name?, ... }
 * DELETE /api/habits/:id      → 软删（status='deleted'）
 * POST   /api/habits/:id/checkin  → 打卡（写入 check_ins 表 + 增加 checkInCount）
 * POST   /api/habits/:id/purge    → 彻底删除（purgeHabit，Module 07 §3）
 * POST   /api/habits/:id/restore  → 恢复（status='deleted' → 'active'）
 */

const express = require('express');
const { db } = require('../db.cjs');
const { requireAuth } = require('./auth.cjs');
const crypto = require('node:crypto');

const router = express.Router();
router.use(requireAuth);

// row → API 对象
function toHabit(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    totalDays: row.total_days,
    checkInCount: row.check_in_count,
    absentCount: row.absent_count,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    reminderType: row.reminder_type,
    reminderTime: row.reminder_time,
    difficulty: row.difficulty,
  };
}

function generateHabitId() {
  return crypto.randomBytes(8).toString('hex');
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM habits WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ habits: rows.map(toHabit) });
});

router.post('/', (req, res) => {
  const {
    name, totalDays, reminderType, reminderTime, color, difficulty,
  } = req.body ?? {};
  if (!name || !totalDays || !reminderType || !reminderTime || !color || !difficulty) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (name.length > 30) return res.status(400).json({ error: 'name_too_long' });
  if (totalDays < 14 || totalDays > 365) return res.status(400).json({ error: 'invalid_total_days' });
  if (difficulty < 1 || difficulty > 5) return res.status(400).json({ error: 'invalid_difficulty' });

  const id = generateHabitId();
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + (totalDays - 1) * 86400000)
    .toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO habits (
      id, user_id, name, color, total_days, check_in_count, absent_count,
      start_date, end_date, status, created_at, reminder_type, reminder_time, difficulty
    ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    id, req.user.id, name, color, totalDays,
    startDate, endDate, Date.now(),
    reminderType, reminderTime, difficulty
  );

  const row = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  res.json({ habit: toHabit(row) });
});

router.patch('/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const values = [];
  const allowed = ['name', 'checkInCount', 'absentCount', 'status'];
  for (const key of allowed) {
    const camel = req.body?.[key];
    if (camel === undefined) continue;
    const snake = {
      name: 'name',
      checkInCount: 'check_in_count',
      absentCount: 'absent_count',
      status: 'status',
    }[key];
    updates.push(`${snake} = ?`);
    values.push(camel);
  }
  if (updates.length === 0) return res.json({ habit: toHabit(row) });

  values.push(id);
  db.prepare(`UPDATE habits SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  res.json({ habit: toHabit(updated) });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  // 已到期 → 已完成；未到期 → 删除（软删）
  const today = new Date().toISOString().slice(0, 10);
  if (today > row.end_date) {
    db.prepare(`UPDATE habits SET status = 'completed' WHERE id = ?`).run(id);
  } else {
    db.prepare(`UPDATE habits SET status = 'deleted' WHERE id = ?`).run(id);
  }
  res.json({ ok: true });
});

/** 打卡 */
router.post('/:id/checkin', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const today = new Date().toISOString().slice(0, 10);
  // 幂等：同一天不重复打卡
  const exists = db.prepare(
    'SELECT 1 FROM check_ins WHERE habit_id = ? AND date = ?'
  ).get(id, today);
  if (exists) {
    return res.status(409).json({ error: 'already_checked_in' });
  }

  // 事务
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO check_ins (habit_id, user_id, date, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(id, req.user.id, today, Date.now());
    db.prepare(`
      UPDATE habits SET check_in_count = check_in_count + 1 WHERE id = ?
    `).run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  res.json({ habit: toHabit(updated) });
});

/** 恢复 */
router.post('/:id/restore', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'deleted') return res.status(400).json({ error: 'not_deleted' });
  const today = new Date().toISOString().slice(0, 10);
  if (today > row.end_date) return res.status(400).json({ error: 'expired' });
  db.prepare(`UPDATE habits SET status = 'active' WHERE id = ?`).run(id);
  const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  res.json({ habit: toHabit(updated) });
});

/** 彻底删除 */
router.post('/:id/purge', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT status FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'deleted') return res.status(400).json({ error: 'not_deleted' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM check_ins WHERE habit_id = ?').run(id);
    db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

/** 当前用户的打卡记录 */
router.get('/checkins', (req, res) => {
  const rows = db.prepare(`
    SELECT habit_id AS habitId, date, timestamp FROM check_ins
    WHERE user_id = ? ORDER BY date DESC
  `).all(req.user.id);
  res.json({ checkIns: rows });
});

module.exports = router;