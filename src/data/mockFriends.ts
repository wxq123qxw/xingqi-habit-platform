import type { Habit, HabitColor } from '../types/habit';
import { todayStr, addDays } from '../utils/date';

const today = todayStr();

/** 好友（仅模块 03 排行榜用，模块 04 实现真实好友关系后会替换） */
export interface MockFriend {
  id: string;
  name: string;
  color: HabitColor;  // 头像色块
  habits: Habit[];
}

/**
 * 5 个 mock 好友，各自的努力值已经过精心设计，确保排行榜有：
 * - 递减趋势，方便视觉验证 Top 5
 *
 * 努力值公式（effort = max(0, checkInCount × difficulty − absentCount)）：
 * - 小李   (Friend-001) = (305×4−60) + (200×5−0) + max(0, 7×1−7) = 1160 + 1000 + 0 = 2160
 * - 阿强   (Friend-002) = (200×4−0) + (100×4−100)              = 800 + 300 = 1100
 * - 小红   (Friend-003) = (100×4−0) + (100×4−0)                 = 400 + 400 = 800
 * - 王芳   (Friend-004) = (100×3−0) + (50×4−0)                  = 300 + 200 = 500
 * - 小张   (Friend-005) = (30×3−0) + max(0, 10×1−20)            = 90 + 0 = 90
 *
 * 历史说明：
 * - 旧版用 totalDays 做分子（spec §4.5.2），小李 = 1400+1000+7 = 2407 与用户并列 rank 1。
 * - 改用 checkInCount 后，排名趋势保持（Top 5 内有 4 个 mock），但不再与用户强制并列。
 *   因为用户在测试中会累计/重置 localStorage，强制 tie 不可靠。
 */
export const mockFriends: MockFriend[] = [
  {
    id: 'f-001',
    name: '小李',
    color: 'sky',
    habits: [
      {
        id: 'f-001-h1',
        name: '深度工作',
        color: 'sky',
        totalDays: 365,
        checkInCount: 305,
        absentCount: 60,
        startDate: addDays(today, -305),
        endDate: addDays(today, 59),
        status: 'active',
        createdAt: Date.now() - 305 * 86400000,
        reminderType: '严肃家父',
        reminderTime: '09:00',
        difficulty: 4,
      },
      {
        id: 'f-001-h2',
        name: '每日阅读',
        color: 'indigo',
        totalDays: 200,
        checkInCount: 200,
        absentCount: 0,
        startDate: addDays(today, -200),
        endDate: addDays(today, -1),
        status: 'completed',
        createdAt: Date.now() - 200 * 86400000,
        reminderType: '高冷御姐',
        reminderTime: '22:00',
        difficulty: 5,
      },
      {
        id: 'f-001-h3',
        name: '日记',
        color: 'lime',
        totalDays: 14,
        checkInCount: 7,
        absentCount: 7,
        startDate: addDays(today, -13),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 13 * 86400000,
        reminderType: '乖巧卖萌',
        reminderTime: '21:30',
        difficulty: 1,
      },
    ],
  },
  {
    id: 'f-002',
    name: '阿强',
    color: 'orange',
    habits: [
      {
        id: 'f-002-h1',
        name: '冥想 20 分钟',
        color: 'teal',
        totalDays: 200,
        checkInCount: 200,
        absentCount: 0,
        startDate: addDays(today, -200),
        endDate: addDays(today, -1),
        status: 'completed',
        createdAt: Date.now() - 200 * 86400000,
        reminderType: '高冷御姐',
        reminderTime: '07:00',
        difficulty: 4,
      },
      {
        id: 'f-002-h2',
        name: '瑜伽',
        color: 'mint',
        totalDays: 200,
        checkInCount: 100,
        absentCount: 100,
        startDate: addDays(today, -199),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 199 * 86400000,
        reminderType: '抽象搞笑',
        reminderTime: '06:30',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'f-003',
    name: '小红',
    color: 'pink',
    habits: [
      {
        id: 'f-003-h1',
        name: '学英语',
        color: 'amber',
        totalDays: 100,
        checkInCount: 100,
        absentCount: 0,
        startDate: addDays(today, -100),
        endDate: addDays(today, -1),
        status: 'completed',
        createdAt: Date.now() - 100 * 86400000,
        reminderType: '乖巧卖萌',
        reminderTime: '19:00',
        difficulty: 4,
      },
      {
        id: 'f-003-h2',
        name: '慢跑',
        color: 'lime',
        totalDays: 100,
        checkInCount: 100,
        absentCount: 0,
        startDate: addDays(today, -100),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 100 * 86400000,
        reminderType: '霸道总裁',
        reminderTime: '06:00',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'f-004',
    name: '王芳',
    color: 'green',
    habits: [
      {
        id: 'f-004-h1',
        name: '睡前阅读',
        color: 'lavender',
        totalDays: 100,
        checkInCount: 100,
        absentCount: 0,
        startDate: addDays(today, -100),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 100 * 86400000,
        reminderType: '高冷御姐',
        reminderTime: '22:00',
        difficulty: 3,
      },
      {
        id: 'f-004-h2',
        name: '周记',
        color: 'purple',
        totalDays: 50,
        checkInCount: 50,
        absentCount: 0,
        startDate: addDays(today, -50),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 50 * 86400000,
        reminderType: '严肃家父',
        reminderTime: '20:00',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'f-005',
    name: '小张',
    color: 'amber',
    habits: [
      {
        id: 'f-005-h1',
        name: '早睡',
        color: 'sky',
        totalDays: 30,
        checkInCount: 30,
        absentCount: 0,
        startDate: addDays(today, -30),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 30 * 86400000,
        reminderType: '乖巧卖萌',
        reminderTime: '22:30',
        difficulty: 3,
      },
      {
        id: 'f-005-h2',
        name: '多喝水',
        color: 'cyan',
        totalDays: 30,
        checkInCount: 10,
        absentCount: 20,
        startDate: addDays(today, -29),
        endDate: today,
        status: 'active',
        createdAt: Date.now() - 29 * 86400000,
        reminderType: '抽象搞笑',
        reminderTime: '10:00',
        difficulty: 1,
      },
    ],
  },
];

/** 调试用：计算所有 mock 好友的总努力值 */
export function debugFriendsEffort(): Array<{
  id: string;
  name: string;
  effort: number;
}> {
  return mockFriends.map((f) => ({
    id: f.id,
    name: f.name,
    effort: f.habits.reduce(
      (sum, h) =>
        sum + Math.max(0, h.checkInCount * h.difficulty - h.absentCount),
      0
    ),
  }));
}