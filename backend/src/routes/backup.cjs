/**
 * Backup 路由（备份列表 / 触发 / 恢复）
 *
 * GET  /api/backups              → 备份列表
 * POST /api/backups/run          → 立即触发一次备份
 * POST /api/backups/:id/restore  → 恢复指定备份（需要重启进程）
 *
 * 注意：
 * - 恢复会替换数据库 + 关闭连接，需要重启后端
 * - 没有鉴权（demo 简化），生产应该要管理员 token
 */

const express = require('express');
const { listBackups, runBackup, restoreBackup } = require('../backup.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ backups: listBackups() });
});

router.post('/run', async (req, res) => {
  try {
    const result = await runBackup();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const result = await restoreBackup(Number(req.params.id));
    res.json({ ok: true, ...result, warning: '数据库已替换，请重启后端进程' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;