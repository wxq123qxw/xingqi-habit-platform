/**
 * 相对时间格式化（中文）
 * 不依赖 dayjs，纯手写避免打包体积膨胀 + 简化依赖
 *
 * 输出格式：
 * - < 60s    → "刚刚"
 * - < 60min  → "X 分钟前"
 * - < 24h    → "X 小时前"
 * - < 30天   → "X 天前"
 * - 其它     → "X 月 X 日"
 */
export function relativeTimeCN(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return '刚刚'; // 时间在未来（系统时间错乱）兜底
  if (diff < 60_000) return '刚刚';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days} 天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}