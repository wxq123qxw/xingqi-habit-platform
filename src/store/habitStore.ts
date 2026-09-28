import type { Habit, CheckInRecord, NewHabitInput } from '../types/habit';
import { todayStr, yesterdayStr, isBefore, addDays } from '../utils/date';
import { habitsApi } from '../api/endpoints';

/**
 * 多用户数据隔离（Phase 6 + Module 09）：
 * 所有习惯 / 打卡都按 userId 分桶存在 localStorage。
 * 切换用户登录时，读到的数据是当前用户自己的，不会串。
 *
 * localStorage key 格式：
 * - habit-platform:habits:<userId>
 * - habit-platform:checkins:<userId>
 * - habit-platform:schemaVersion:<userId>
 *
 * 旧版本（无 userId）的 key 保留，不读，等用户登录新账号再自动初始化。
 *
 * Module 09 双轨：
 * - 写操作：localStorage 立即生效（保证 UI 同步响应）+ fire-and-forget 调后端 API
 *   - API 失败（NETWORK_ERROR）→ 仅本地修改（用户断网时仍可用）
 *   - API 成功 → 仅本地（不做覆盖，让客户端 ID 与服务端 ID 共存）
 * - 读操作：只读 localStorage（写时已同步）
 * - 排行榜：跨用户数据走 /api/leaderboard（详见 components/Leaderboard.tsx）
 */

const SCHEMA_VERSION = 'v3';

const habitsKey = (userId: string) => `habit-platform:habits:${userId}`;
const checkinsKey = (userId: string) => `habit-platform:checkins:${userId}`;
const absentKey = (userId: string) =>
  `habit-platform:lastAbsentCheckDate:${userId}`;
const versionKey = (userId: string) =>
  `habit-platform:schemaVersion:${userId}`;

/** 生成 habit id（带前缀，方便调试） */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'h-' + crypto.randomUUID().slice(0, 8);
  }
  return 'h-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * schema 迁移：检测到旧版本 → 清空旧数据 → 下次读取会重新用最新 mock 初始化。
 */
function ensureSchemaVersion(userId: string): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(versionKey(userId)) === SCHEMA_VERSION) return;
  localStorage.removeItem(habitsKey(userId));
  localStorage.removeItem(checkinsKey(userId));
  localStorage.removeItem(absentKey(userId));
  localStorage.setItem(versionKey(userId), SCHEMA_VERSION);
}

/**
 * 读取 habits。
 * 多用户隔离关键：每个 userId 独立一个桶。新用户桶为空时返回 []，
 * **不会**自动用 mock 初始化（避免新用户"继承"老用户的演示数据）。
 *
 * 行为：
 * - 老用户（localStorage 有自己的桶）→ 读自己的桶
 * - 新用户（localStorage 没自己的桶）→ 返回空数组，等用户自己创建习惯
 */
export function getHabits(userId: string): Habit[] {
  if (!userId) return [];
  if (typeof window === 'undefined') return [];
  ensureSchemaVersion(userId);
  const raw = localStorage.getItem(habitsKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** 整体写回 habits（按 userId 分桶） */
export function saveHabits(userId: string, habits: Habit[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(habitsKey(userId), JSON.stringify(habits));
}

/**
 * 读取打卡记录（按 userId 分桶）。
 * 新用户桶为空时返回 []，不 mock 初始化。
 */
export function getCheckIns(userId: string): CheckInRecord[] {
  if (!userId) return [];
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(checkinsKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** 整体写回打卡记录 */
export function saveCheckIns(userId: string, records: CheckInRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(checkinsKey(userId), JSON.stringify(records));
}

/** 某习惯今天是否已打卡 */
export function hasCheckedInToday(userId: string, habitId: string): boolean {
  return getCheckIns(userId).some(
    (r) => r.habitId === habitId && r.date === todayStr()
  );
}

/**
 * 给某习惯增加一次打卡。
 * - 一天一次：今天已打过则直接返回 false
 * - 成功：写入 CheckInRecord + checkInCount +1
 * - 最后一天：若今天是 endDate，则 status 切到 completed（永不再出现）
 * 返回 true 表示本次确实完成了一次打卡，false 表示已是重复点击。
 */
export function addCheckIn(userId: string, habitId: string): boolean {
  if (hasCheckedInToday(userId, habitId)) return false;

  const records = getCheckIns(userId);
  records.push({
    habitId,
    date: todayStr(),
    timestamp: Date.now(),
  });
  saveCheckIns(userId, records);

  const habits = getHabits(userId).map((h) => {
    if (h.id !== habitId) return h;
    const isLastDay = h.endDate === todayStr();
    return {
      ...h,
      checkInCount: h.checkInCount + 1,
      ...(isLastDay ? { status: 'completed' as const } : {}),
    };
  });
  saveHabits(userId, habits);

  // Module 09：双写到后端（fire-and-forget）
  habitsApi.checkIn(habitId).catch(() => {/* ignore */});

  return true;
}

/**
 * 创建新习惯（Tab 2 保存时调用）。
 * - 自动生成 id
 * - startDate = 今天
 * - endDate = 今天 + (totalDays - 1) 天，恰好 totalDays 天
 * - 计数全部为 0，状态 active
 * - 写入当前用户的桶并返回新习惯对象
 */
export function createHabit(userId: string, input: NewHabitInput): Habit {
  const newHabit: Habit = {
    id: generateId(),
    name: input.name.trim(),
    color: input.color,
    totalDays: input.totalDays,
    checkInCount: 0,
    absentCount: 0,
    startDate: todayStr(),
    endDate: addDays(todayStr(), input.totalDays - 1),
    status: 'active',
    createdAt: Date.now(),
    reminderType: input.reminderType,
    reminderTime: input.reminderTime,
    difficulty: input.difficulty,
  };

  const habits = getHabits(userId);
  habits.push(newHabit);
  saveHabits(userId, habits);

  // Module 09：双写 —— fire-and-forget 同步到后端（不阻塞 UI）
  habitsApi
    .create({
      name: input.name.trim(),
      totalDays: input.totalDays,
      reminderType: input.reminderType,
      reminderTime: input.reminderTime,
      color: input.color,
      difficulty: input.difficulty,
    })
    .catch(() => {/* NETWORK_ERROR 或其他 → 静默忽略，本地已是权威 */});

  return newHabit;
}

/** 强制把某条习惯置为 completed */
export function markCompleted(userId: string, habitId: string): void {
  const habits = getHabits(userId).map((h) =>
    h.id === habitId ? { ...h, status: 'completed' as const } : h
  );
  saveHabits(userId, habits);
}

/** 强制给某习惯 +1 缺勤 */
export function incrementAbsent(userId: string, habitId: string): void {
  const habits = getHabits(userId).map((h) =>
    h.id === habitId ? { ...h, absentCount: h.absentCount + 1 } : h
  );
  saveHabits(userId, habits);
}

/**
 * 每日首次进入时调用一次。
 *
 * 职责：扫描 habit.startDate → yesterday，更新 habit.absentCount + 自动归档
 *
 * idempotent 重新计算（不是累加）：
 * - 改时间测试时：改到次日 → 重新算（增加）；改回今日 → 重新算（还原）
 *
 * 注意：本函数只计算缺勤次数，**不入队缺勤动画**——用户已确认不需要缺勤动画
 *
 * 边界：
 * - habit.status !== 'active' → 跳过
 * - 习惯已到期（endDate < today）→ 归档 status='completed'
 * - checkInCount + absentCount >= totalDays → 自动归档
 *
 * 多用户隔离：每个 userId 各自维护 lastAbsentCheckDate。
 */
export function runDailyAbsentCheck(userId: string): void {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  const today = todayStr();
  if (localStorage.getItem(absentKey(userId)) === today) return;

  const habits = getHabits(userId);
  const records = getCheckIns(userId);

  const yesterday = yesterdayStr();

  const updated = habits.map((h) => {
    if (h.status !== 'active') return h;

    // 已到期 → 归档
    if (isBefore(h.endDate, today)) {
      return { ...h, status: 'completed' as const };
    }

    // 从 habit.startDate 扫到昨天（idempotent 重新计算）
    let newAbsent = 0;
    let d = h.startDate;
    while (!isBefore(yesterday, d)) {
      const checked = records.some(
        (r) => r.habitId === h.id && r.date === d
      );
      if (!checked) newAbsent++;
      d = addDays(d, 1);
    }

    const absentDelta = newAbsent - h.absentCount;

    let newStatus: Habit['status'] = h.status;
    if (h.checkInCount + newAbsent >= h.totalDays) {
      newStatus = 'completed';
    }

    if (absentDelta === 0 && newStatus === h.status) return h;
    return {
      ...h,
      absentCount: newAbsent,
      ...(newStatus !== h.status ? { status: newStatus } : {}),
    };
  });

  saveHabits(userId, updated);
  localStorage.setItem(absentKey(userId), today);
}

/* ============================================================
 * 删除 / 恢复（Tab 4 设置调用）
 * 多用户隔离：按 userId 操作自己的桶
 * ========================================================== */

/** 删除习惯：status='deleted'，不删除记录。返回是否成功 */
export function deleteHabit(userId: string, id: string): boolean {
  const habits = getHabits(userId);
  const idx = habits.findIndex((h) => h.id === id);
  if (idx === -1) return false;
  if (habits[idx].status === 'deleted') return false;

  const updated = [...habits];
  updated[idx] = { ...updated[idx], status: 'deleted' as const };
  saveHabits(userId, updated);

  // 双写到后端
  habitsApi.softDelete(id).catch(() => {/* ignore */});

  return true;
}

/** 恢复已删除习惯：已到期的不能恢复 */
export function restoreHabit(userId: string, id: string): Habit | null {
  const habits = getHabits(userId);
  const idx = habits.findIndex((h) => h.id === id);
  if (idx === -1) return null;
  const h = habits[idx];
  if (h.status !== 'deleted') return null;

  if (isBefore(h.endDate, todayStr())) return null;

  const updated = [...habits];
  updated[idx] = { ...h, status: 'active' as const };
  saveHabits(userId, updated);

  // 双写到后端
  habitsApi.restore(id).catch(() => {/* ignore */});

  return updated[idx];
}

/** 取所有 deleted 习惯，按创建时间倒序 */
export function getDeletedHabits(userId: string): Habit[] {
  return getHabits(userId)
    .filter((h) => h.status === 'deleted')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 彻底删除习惯（不可恢复）
 * - 从 habits 桶里完全移除该 habit（不是 status='deleted'）
 * - 同时删除该 habit 的所有 checkin 记录
 * - 用于"恢复已删除习惯"列表中的"彻底删除"按钮
 *
 * 返回是否成功删除。
 */
export function purgeHabit(userId: string, id: string): boolean {
  const habits = getHabits(userId);
  const target = habits.find((h) => h.id === id);
  if (!target) return false;
  // 只允许彻底删除已软删除（status='deleted'）的习惯，避免误操作
  if (target.status !== 'deleted') return false;

  // 从 habits 桶中移除
  const updated = habits.filter((h) => h.id !== id);
  saveHabits(userId, updated);

  // 清理该 habit 的所有打卡记录
  const records = getCheckIns(userId).filter((r) => r.habitId !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(checkinsKey(userId), JSON.stringify(records));
  }

  // 双写到后端
  habitsApi.purge(id).catch(() => {/* ignore */});

  return true;
}