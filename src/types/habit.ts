// 习惯状态：进行中 / 已完成（归档） / 已删除（软删，spec §4.5.2 + Module 04 §4.5）
// - 'deleted' 用于"删除"流程：努力值清零、可恢复、可彻底删除（Module 07 §3 purgeHabit）
// - 'completed' 用于"已到期"：不再展示在 Tab 1，但保留在数据里
// - 'active' 是默认状态
export type HabitStatus = 'active' | 'completed' | 'deleted';

// 习惯卡片可用颜色（18 色 —— 与 utils/colors.ts COLOR_HEX 一一对应）
export type HabitColor =
  | 'red'
  | 'rose'
  | 'pink'
  | 'coral'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'mint'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'lavender'
  | 'purple'
  | 'slate';

// 习惯提醒方式（**固定 5 种，不得增减** —— 见 02_习惯创建_Tab2.md §4.4）
export type ReminderType =
  | '抽象搞笑'
  | '霸道总裁'
  | '严肃家父'
  | '乖巧卖萌'
  | '高冷御姐';

// 提供给表单渲染用的有序列表
export const REMINDER_TYPES: ReminderType[] = [
  '抽象搞笑',
  '霸道总裁',
  '严肃家父',
  '乖巧卖萌',
  '高冷御姐',
];

// ==================== 数据模型 ====================

export interface Habit {
  id: string;
  name: string;
  color: HabitColor;
  totalDays: number;
  checkInCount: number;
  absentCount: number;
  startDate: string;
  endDate: string;
  status: HabitStatus;
  createdAt: number;
  reminderType: ReminderType;
  reminderTime: string;
  difficulty: number;
}

export interface CheckInRecord {
  habitId: string;
  date: string;
  timestamp: number;
}

// ==================== 新建习惯的输入 ====================

export interface NewHabitInput {
  name: string;
  totalDays: number;
  reminderType: ReminderType;
  reminderTime: string;
  color: HabitColor;
  difficulty: number;
}

// ==================== 校验工具 ====================

export const HABIT_LIMITS = {
  nameMin: 1,
  nameMax: 30,
  totalDaysMin: 14,
  totalDaysMax: 365,
  difficultyMin: 1,
  difficultyMax: 5,
} as const;

export function isValidTimeString(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}