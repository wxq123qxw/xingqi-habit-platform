import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

/** 把 Date 或字符串格式化为 YYYY-MM-DD */
export function formatDate(input: Date | string | dayjs.Dayjs): string {
  return dayjs(input).format('YYYY-MM-DD');
}

/** 今天的 YYYY-MM-DD */
export function todayStr(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** 昨天 YYYY-MM-DD */
export function yesterdayStr(): string {
  return dayjs().subtract(1, 'day').format('YYYY-MM-DD');
}

/** 两个日期相差多少天（b - a），可负 */
export function daysBetween(a: string, b: string): number {
  return dayjs(b).startOf('day').diff(dayjs(a).startOf('day'), 'day');
}

/** 在某个日期上加 n 天，返回 YYYY-MM-DD */
export function addDays(dateStr: string, n: number): string {
  return dayjs(dateStr).add(n, 'day').format('YYYY-MM-DD');
}

/** 是否是今天 */
export function isToday(dateStr: string): boolean {
  return dateStr === todayStr();
}

/** a 是否早于 b（按天） */
export function isBefore(a: string, b: string): boolean {
  return dayjs(a).startOf('day').isBefore(dayjs(b).startOf('day'));
}

/** 今天的中文显示（如 "2026年9月25日 周五"） */
export function todayCN(): string {
  return dayjs().format('YYYY年M月D日 dddd');
}