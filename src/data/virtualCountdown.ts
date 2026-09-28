/**
 * 虚拟习惯动态展开（Module 07）—— 把 mock 候选人的 VirtualHabitSeed[]
 * 按今天日期展开成完整的 Habit[]，再算出 effort
 *
 * 为什么需要这个文件：
 * - 用户在 2026-09-26 要求"真正实现好友之间排行榜的排行数据"
 * - 旧 mockCandidates.ts 把 effort 写死成 2160/1100/800/500/90，看起来很假
 * - 新版：每个候选人有自己的 virtualHabits + virtualProfile
 *   - effort 由候选人自己的"虚拟习惯"动态算出
 *   - 公式跟真人完全一致（effort = max(0, checkInCount × difficulty - absentCount)）
 *   - 所以"今天比昨天多 1 天" → 候选人的 effort 会自然增加（或减少如果今天缺勤）
 *
 * 关键设计：
 * - 不存 localStorage（不污染用户数据）
 * - 完全确定性：相同 today + 相同 candidateId → 相同 Habit[]
 *   → "跨日跨平台"测试稳定
 * - 算法只用 init 时每候选人的 checkInRatio 模拟"今天是否打卡"
 *   注意：每次刷新页面，checkInRatio 是常量，所以 effort 是稳定的（避免每次刷新排行榜数字乱跳）
 * - 用一个伪随机但确定性的小函数模拟"今天打没打卡"（基于 (today, candidateId, habitIndex)）
 *
 * API：
 * - getMockCandidateHabits(id, today?)   → Habit[]
 * - getMockCandidateEffort(id, today?)    → number
 * - expandVirtualHabits(candidate, today?) → Habit[]
 */

import dayjs from 'dayjs';
import type { Habit } from '../types/habit';
import {
  mockCandidates as mockCandidatesRef,
  type MockCandidate,
  type VirtualHabitSeed,
} from './mockCandidates';

// ============================================================
// 确定性伪随机 —— "今天这个候选人这个习惯是否打了卡"
// ============================================================

/**
 * 简单字符串 hash（djb2 变种），用于从 (today + id) 推出一个稳定整数
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 给定 (dateStr, candidateId, habitIndex) → 一个稳定的 0~1 之间的伪随机数
 * 用确定性 hash，避免每次刷新 effort 跳来跳去
 */
function stableRandom(dateStr: string, candidateId: string, habitIndex: number): number {
  const key = `${dateStr}|${candidateId}|${habitIndex}`;
  return (hashString(key) % 10000) / 10000;
}

/**
 * 给定今天日期 + 候选人 + 习惯索引 → 模拟"今天是否打卡"
 * 基于 stableRandom < checkInRatio → 打卡
 */
function didCheckInToday(
  today: string,
  candidate: MockCandidate,
  habitIndex: number
): boolean {
  const r = stableRandom(today, candidate.id, habitIndex);
  return r < candidate.virtualProfile.checkInRatio;
}

// ============================================================
// 核心展开函数
// ============================================================

/**
 * 把候选人 + 虚拟习惯种子 → 完整 Habit[]
 *
 * 每个种子的处理：
 * 1. startDate = today - startDaysAgo
 * 2. endDate = startDate + totalDays - 1
 * 3. daysActive = clamp(today - startDate + 1, 0, totalDays)
 * 4. status:
 *    - today > endDate → 'completed'
 *    - else → 'active'
 * 5. checkInCount = floor(daysActive × checkInRatio) + 1 (今天打了)
 *    - 若 today == startDate（习惯刚创建一天） → checkInCount = 1 (如果打卡)
 *    - 若 today > endDate → checkInCount = totalDays × checkInRatio (floor) - 今天可能还要算
 * 6. absentCount = daysActive - checkInCount
 * 7. id 合成：`virtual-${candidateId}-${baseName}`
 * 8. name = `${profile.habitNamePrefix}${seed.baseName}`
 *
 * @param today 可选，默认 `new Date()`；传固定日期便于跨日测试
 */
export function expandVirtualHabits(
  candidate: MockCandidate,
  today: Date = new Date()
): Habit[] {
  const todayStr = dayjs(today).format('YYYY-MM-DD');
  const prefix = candidate.virtualProfile.habitNamePrefix;

  return candidate.virtualHabits.map((seed: VirtualHabitSeed, idx) => {
    // 1. 起止日期
    const startDate = dayjs(today).subtract(seed.startDaysAgo, 'day').format('YYYY-MM-DD');
    const endDate = dayjs(startDate).add(seed.totalDays - 1, 'day').format('YYYY-MM-DD');

    // 2. 已坚持天数（含今天）
    // - 若 today < startDate → 0
    // - 若 startDate <= today <= endDate → today - startDate + 1
    // - 若 today > endDate → totalDays（已完成）
    let daysActive: number;
    if (dayjs(todayStr).isBefore(dayjs(startDate))) {
      daysActive = 0;
    } else if (dayjs(todayStr).isAfter(dayjs(endDate))) {
      daysActive = seed.totalDays;
    } else {
      daysActive = dayjs(todayStr).diff(dayjs(startDate), 'day') + 1;
    }

    // 3. 状态：已完成 vs 进行中
    const status: 'active' | 'completed' = dayjs(todayStr).isAfter(dayjs(endDate))
      ? 'completed'
      : 'active';

    // 4. checkInCount
    // - 累积天数按比例：floor(daysActive × checkInRatio)
    // - 今天是否打卡：基于 stableRandom
    //   - 今天打卡：checkInCount = 累积 + 1
    //   - 今天没打卡：checkInCount = 累积
    // - daysActive == 0（习惯还没到） → checkInCount = 0
    let checkInCount = 0;
    if (daysActive > 0) {
      const cumulative = Math.floor(daysActive * candidate.virtualProfile.checkInRatio);
      const todayChecked = didCheckInToday(todayStr, candidate, idx);
      checkInCount = todayChecked ? cumulative + 1 : cumulative;
    }
    // 不要超过 totalDays
    checkInCount = Math.min(checkInCount, seed.totalDays);

    // 5. absentCount = daysActive - checkInCount（至少 0）
    const absentCount = Math.max(0, daysActive - checkInCount);

    return {
      id: `virtual-${candidate.id}-${seed.baseName}`,
      name: `${prefix}${seed.baseName}`,
      color: seed.color,
      totalDays: seed.totalDays,
      checkInCount,
      absentCount,
      startDate,
      endDate,
      status,
      createdAt: dayjs(startDate).valueOf(),
      reminderType: seed.reminderType,
      reminderTime: seed.reminderTime,
      difficulty: seed.difficulty,
    } satisfies Habit;
  });
}

// ============================================================
// 顶层 API
// ============================================================

/**
 * 取候选人按 ID；找不到返回 null
 */
export function findMockCandidate(id: string): MockCandidate | null {
  return mockCandidatesRef.find((c) => c.id === id) ?? null;
}

/**
 * 拿候选人的虚拟 Habit[] —— 给 Leaderboard 用
 * @returns Habit[] 或 null（id 找不到候选人时）
 */
export function getMockCandidateHabits(
  id: string,
  today: Date = new Date()
): Habit[] | null {
  const c = findMockCandidate(id);
  if (!c) return null;
  return expandVirtualHabits(c, today);
}

/**
 * 拿候选人的动态 effort（基于自己虚拟习惯的总努力值）
 * @returns effort 数字，找不到候选人返回 0
 */
export function getMockCandidateEffort(
  id: string,
  today: Date = new Date()
): number {
  const habits = getMockCandidateHabits(id, today);
  if (!habits) return 0;
  return habits.reduce((sum, h) => {
    if (h.status === 'deleted') return sum;
    const e = Math.max(0, h.checkInCount * h.difficulty - h.absentCount);
    return sum + e;
  }, 0);
}

/**
 * 拿候选人的虚拟 Habit 总数（调试 / 显示用）
 */
export function getMockCandidateHabitCount(id: string): number {
  const c = findMockCandidate(id);
  return c?.virtualHabits.length ?? 0;
}