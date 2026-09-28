/**
 * 频率限制（Module 09 安全加固）
 *
 * 简单的内存级 token bucket：
 *   - 每个 IP 维护一个"过去 60s 内的请求数"计数
 *   - 超过阈值（默认 60/min）直接 429
 *   - 不需要 Redis 等外部依赖,适合单机 demo
 *
 * 注意：
 *   - 这是 best-effort 防护,不是防 DoS 的工业级方案
 *   - 多进程部署时各进程独立计数（单机 Express 不受影响）
 *   - Express 自带 ip 通过 req.ip（req.ips 取最左 X-Forwarded-For,要看 trust proxy 配置）
 */

const buckets = new Map(); // ip -> { count, windowStart }

const LIMIT_PER_MINUTE = (() => {
  const n = Number(process.env.RATE_LIMIT_PER_MINUTE ?? '60');
  return Number.isFinite(n) && n > 0 ? n : 60;
})();
const WINDOW_MS = 60 * 1000;

/**
 * 滑动窗口限流中间件
 * - 超过 LIMIT_PER_MINUTE 次/分钟 → 返回 429
 * - 每分钟自动重置
 */
function rateLimitMiddleware(req, res, next) {
  // req.ip 在 Express 里有值(可能 ::1, 127.0.0.1, 192.168.x.x)
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { count: 0, windowStart: now };
    buckets.set(ip, bucket);
  }
  // 窗口过期 → 重置
  if (now - bucket.windowStart >= WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;

  // 响应头（让客户端能看限额）
  res.setHeader('X-RateLimit-Limit', String(LIMIT_PER_MINUTE));
  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, LIMIT_PER_MINUTE - bucket.count)),
  );

  if (bucket.count > LIMIT_PER_MINUTE) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({
      error: 'rate_limited',
      message: `Too many requests. Max ${LIMIT_PER_MINUTE} per minute.`,
    });
  }
  next();
}

/**
 * 周期清理：每分钟扫描一次,把过期的 bucket 清掉,防止内存累积
 */
function startJanitor() {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) {
      if (now - b.windowStart >= WINDOW_MS * 2) {
        buckets.delete(ip);
      }
    }
  }, WINDOW_MS);
}

module.exports = { rateLimitMiddleware, startJanitor, LIMIT_PER_MINUTE };