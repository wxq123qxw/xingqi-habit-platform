import type { Habit } from '../types/habit';

/**
 * 单习惯努力值
 * spec §4.5.2 规则：
 * - IF 习惯 status === 'deleted' → 0（删除即清零，模块 04 Tab 4 设置）
 * - IF 其它 → max(0, checkInCount × difficulty − absentCount)
 *
 * 公式 vs spec 修正：
 * - spec 原本用 totalDays 做分子（计划天数），修正为 checkInCount（已坚持天数）。
 *   原因见 Phase 3.2 用户反馈：刚创建习惯只打卡 1 天时，不应拿到 30d × 难度 的高分。
 * - 缺席惩罚仍按 spec 走"不乘难度，每次扣 1"，避免缺席代价过重。
 */
export function calculateHabitEffort(habit: Habit): number {
  // 删除/已删除 → 0
  if (habit.status === 'deleted') return 0;
  const raw = habit.checkInCount * habit.difficulty - habit.absentCount;
  return Math.max(0, raw);
}

/** 用户总努力值 = 所有习惯努力值之和 */
export function calculateUserTotalEffort(habits: Habit[]): number {
  return habits.reduce((sum, h) => sum + calculateHabitEffort(h), 0);
}

/** 习惯状态统计 */
export interface HabitCounts {
  active: number;
  completed: number;
  total: number;
}

export function countHabitsByStatus(habits: Habit[]): HabitCounts {
  return habits.reduce(
    (acc, h) => {
      acc.total++;
      if (h.status === 'active') acc.active++;
      else if (h.status === 'completed') acc.completed++;
      return acc;
    },
    { active: 0, completed: 0, total: 0 }
  );
}

/**
 * 并列排名（dense_rank 思路）
 * - 努力值降序
 * - 相同努力值 → 相同名次（不递进，跳号）
 * - 例: [100, 100, 80] → [1, 1, 3]
 * - 例: [100, 100, 100] → [1, 1, 1]
 * - 例: [100, 80, 60] → [1, 2, 3]
 *
 * @see 03_统计中心_Tab3.md §4.4
 */
export function rankWithTies<T>(
  items: T[],
  getValue: (item: T) => number
): Array<{ item: T; rank: number; value: number }> {
  // 稳定排序（保持原顺序作为 tie-breaker）
  const indexed = items.map((item, index) => ({
    item,
    index,
    value: getValue(item),
  }));
  const sorted = [...indexed].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.index - b.index;
  });

  let rank = 0;
  let prevValue: number | null = null;
  let prevRank = 0;

  return sorted.map((entry, i) => {
    if (entry.value !== prevValue) {
      rank = i + 1;
      prevValue = entry.value;
      prevRank = rank;
    } else {
      rank = prevRank;
    }
    return { item: entry.item, rank, value: entry.value };
  });
}