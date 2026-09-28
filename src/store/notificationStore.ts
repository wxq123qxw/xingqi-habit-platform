/**
 * 通知 / 动画 标记（按 userId 分桶）
 *
 * 两种独立的标记机制（独立 key，互不干扰）：
 *
 * - pushed  : 已发送浏览器通知（定时推送用）
 *   key:    `habit-platform:reminderPushed:<userId>`
 *   触发条件：本地时间 == habit.reminderTime
 *
 * - animated: 已入队提醒动画（累积型扫描用）
 *   key:    `habit-platform:reminderAnimated:<userId>`
 *   触发条件：用户打开 App，扫描 reminderTime <= currentHHMM 的未打卡 habit
 *
 * 数据结构：JSON 数组 [{ habitId, date: 'YYYY-MM-DD', ts: epochMs }]
 *
 * 两个 key 互不干扰：
 * - 通知可能在 reminderTime 准时推送，动画可能在用户 09:30 打开 App 才入队
 * - 同一 habit 可能：到点有通知 + 之后开 App 看到动画
 */

import { todayStr } from '../utils/date';

const pushedKey = (userId: string) =>
  `habit-platform:reminderPushed:${userId}`;

const animatedKey = (userId: string) =>
  `habit-platform:reminderAnimated:${userId}`;

interface PushedRecord {
  habitId: string;
  date: string;
  ts: number;
}

// ============================================================
// 通用读写
// ============================================================

function readRecords(key: string): PushedRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(key: string, records: PushedRecord[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(records));
}

function appendRecord(key: string, habitId: string, today: string): void {
  const records = readRecords(key);
  // 去重
  const filtered = records.filter(
    (r) => !(r.habitId === habitId && r.date === today)
  );
  filtered.push({ habitId, date: today, ts: Date.now() });
  writeRecords(key, filtered);
}

// ============================================================
// 通知标记（定时推送用）
// ============================================================

/** 某个 habit 今天是否已发送过浏览器通知 */
export function isPushedToday(userId: string, habitId: string): boolean {
  const today = todayStr();
  return readRecords(pushedKey(userId)).some(
    (r) => r.habitId === habitId && r.date === today
  );
}

/** 标记某个 habit 今天已发送浏览器通知 */
export function markPushedToday(userId: string, habitId: string): void {
  appendRecord(pushedKey(userId), habitId, todayStr());
}

/**
 * 清理非今日的推送记录（避免 localStorage 无限增长）
 */
export function cleanupOldPushedRecords(userId: string): void {
  const today = todayStr();
  const records = readRecords(pushedKey(userId));
  const filtered = records.filter((r) => r.date === today);
  if (filtered.length !== records.length) {
    writeRecords(pushedKey(userId), filtered);
  }
}

// ============================================================
// 动画标记（累积型扫描用）
// ============================================================

/** 某个 habit 今天是否已入队过提醒动画 */
export function isAnimatedToday(userId: string, habitId: string): boolean {
  const today = todayStr();
  return readRecords(animatedKey(userId)).some(
    (r) => r.habitId === habitId && r.date === today
  );
}

/** 标记某个 habit 今天已入队提醒动画 */
export function markAnimatedToday(userId: string, habitId: string): void {
  appendRecord(animatedKey(userId), habitId, todayStr());
}

/**
 * 清理非今日的动画标记（避免 localStorage 无限增长）
 */
export function cleanupOldAnimatedRecords(userId: string): void {
  const today = todayStr();
  const records = readRecords(animatedKey(userId));
  const filtered = records.filter((r) => r.date === today);
  if (filtered.length !== records.length) {
    writeRecords(animatedKey(userId), filtered);
  }
}

// ============================================================
// 扫描函数
// ============================================================

export interface PendingHabit {
  habitId: string;
  habitName: string;
  reminderType: import('../types/habit').ReminderType;
}

type HabitForScan = {
  id: string;
  name: string;
  status: string;
  reminderTime: string;
  reminderType: import('../types/habit').ReminderType;
};

/**
 * 定时推送扫描（提醒通知用）
 *
 * 触发条件：本地时间 == habit.reminderTime（精确到分钟）
 * 行为：到点自动推，不依赖用户是否打开 App
 *
 * 条件：
 * - habit.status === 'active'
 * - habit.reminderTime === currentHHMM（精确匹配）
 * - 今日未打卡
 * - 今日未推送过通知（防止重复推送）
 */
export function findHabitsAtCurrentMinute(
  userId: string,
  habits: HabitForScan[],
  currentHHMM: string,
  hasCheckedInToday: (habitId: string) => boolean
): PendingHabit[] {
  return habits
    .filter((h) => h.status === 'active')
    .filter((h) => h.reminderTime === currentHHMM)
    .filter((h) => !hasCheckedInToday(h.id))
    .filter((h) => !isPushedToday(userId, h.id))
    .map((h) => ({
      habitId: h.id,
      habitName: h.name,
      reminderType: h.reminderType,
    }));
}

/**
 * 累积型扫描（提醒动画用）
 *
 * 触发条件：用户打开 App 时扫描
 * 行为：补弹所有"已过 reminderTime 但今日未打卡"的 habit
 *
 * 多个 habit 没打卡的情况：依次入队，AnimationQueuePlayer 依次播放
 *
 * 条件：
 * - habit.status === 'active'
 * - habit.reminderTime <= currentHHMM（已过 reminderTime）
 * - 今日未打卡
 * - 今日未入队过动画（防止重复入队）
 */
export function findPendingHabits(
  userId: string,
  habits: HabitForScan[],
  currentHHMM: string,
  hasCheckedInToday: (habitId: string) => boolean
): PendingHabit[] {
  return habits
    .filter((h) => h.status === 'active')
    .filter((h) => h.reminderTime <= currentHHMM)
    .filter((h) => !hasCheckedInToday(h.id))
    .filter((h) => !isAnimatedToday(userId, h.id))
    .map((h) => ({
      habitId: h.id,
      habitName: h.name,
      reminderType: h.reminderType,
    }));
}