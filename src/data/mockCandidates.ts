import type { HabitColor, ReminderType } from '../types/habit';

/**
 * 好友系统 mock 候选人池 —— Module 07 升级版
 *
 * 设计目标（用户在 2026-09-26 提出）：
 * - "真正实现好友之间排行榜的排行数据"
 * - 不再 hardcoded effort —— 让 mock 候选人有自己的"虚拟 habit 习惯"
 * - effort = 基于候选人自己的虚拟习惯 + 今天日期 动态算出
 *   → 排行榜上的数字每天都会变（更逼真）
 *
 * 数据形态：
 * - id / nickname / color：不变的"身份"信息
 * - virtualHabits：候选人的"虚拟习惯种子"，每个种子里
 *   - name / totalDays / difficulty / reminderType / reminderTime
 *   - startDaysAgo：这个习惯是距今几天前开始的（用于动态算 startDate）
 * - virtualProfile：候选人整体的"打卡表现"参数
 *   - checkInRatio：每天打卡的概率（0.7~0.95，不同人不同）
 *   - habitNamePrefix：习惯名前缀（防止不同候选人 habit 同名混淆）
 *
 * 注意：
 * - 虚拟习惯**不存 localStorage**，每次 Tab 3 加载时按今天日期动态生成 Habit[]
 * - 计算公式跟真人 effort 完全一致：effort = max(0, checkInCount × difficulty - absentCount)
 *   所以排行榜的"真" = 真公式 + 真日期 + 真人假习惯
 *
 * 与旧版本差异：
 * - 旧版 effort: 2160/1100/800/500/90 是写死的（user 反馈是 mock 数据）
 * - 新版 effort 由 utils/virtualHabits.ts 动态算（每次刷新 / 改时间都会变）
 */

export interface MockCandidate {
  id: string;          // 10 字符唯一 ID（符合 isValidUserId 校验）
  nickname: string;
  color: HabitColor;    // 头像色块
  /**
   * 该候选人的"虚拟习惯"列表 —— 不存 localStorage，按今天日期动态展开成 Habit[]
   * 每个习惯用 startDaysAgo 反推 startDate
   */
  virtualHabits: VirtualHabitSeed[];
  /**
   * 该候选人的"打卡画像"——影响虚拟习惯的 checkInCount / absentCount
   * - checkInRatio: 0~1，每天"打卡"的概率
   * - habitNamePrefix: 候选人习惯名前缀（避免不同候选人习惯重名）
   */
  virtualProfile: VirtualProfile;
}

export interface VirtualHabitSeed {
  /** 习惯名（不含前缀，前缀在算 Habit.name 时拼上） */
  baseName: string;
  /** 计划天数 */
  totalDays: number;
  /** 难度 1~5 */
  difficulty: number;
  /** 提醒方式（决定动画分类） */
  reminderType: ReminderType;
  /** 提醒时间 HH:MM */
  reminderTime: string;
  /** 距今天几天前开始（>=0），用于反推 startDate / endDate */
  startDaysAgo: number;
  /** 当前职业（也决定颜色） */
  color: HabitColor;
}

export interface VirtualProfile {
  /** 每天打卡概率 0~1（每个候选人不同） */
  checkInRatio: number;
  /** 习惯名前缀（防止重名） */
  habitNamePrefix: string;
}

export const mockCandidates: MockCandidate[] = [
  // 小李：5 个虚拟习惯，难度高、勤奋（checkInRatio 0.92），努力值最高
  {
    id: 'L!3aZ9bN?x',
    nickname: '小李',
    color: 'sky',
    virtualProfile: { checkInRatio: 0.92, habitNamePrefix: '小李·' },
    virtualHabits: [
      { baseName: '每日晨跑',   totalDays: 365, difficulty: 5, reminderType: '严肃家父', reminderTime: '06:30', startDaysAgo: 180, color: 'green'  },
      { baseName: '阅读 30 分钟', totalDays: 180, difficulty: 4, reminderType: '抽象搞笑', reminderTime: '21:00', startDaysAgo: 120, color: 'amber'  },
      { baseName: '冥想',       totalDays: 90,  difficulty: 3, reminderType: '乖巧卖萌', reminderTime: '07:00', startDaysAgo: 60,  color: 'sky'    },
      { baseName: '英语单词',    totalDays: 365, difficulty: 4, reminderType: '霸道总裁', reminderTime: '22:00', startDaysAgo: 200, color: 'indigo' },
      { baseName: '记录日记',    totalDays: 60,  difficulty: 2, reminderType: '高冷御姐', reminderTime: '23:00', startDaysAgo: 40,  color: 'rose'   },
    ],
  },
  // 阿强：3 个虚拟习惯，中等勤奋（0.85），努力值中
  {
    id: 'M@kL2$pQ8w',
    nickname: '阿强',
    color: 'orange',
    virtualProfile: { checkInRatio: 0.85, habitNamePrefix: '阿强·' },
    virtualHabits: [
      { baseName: '健身',       totalDays: 180, difficulty: 4, reminderType: '严肃家父', reminderTime: '18:00', startDaysAgo: 90,  color: 'red'    },
      { baseName: '戒咖啡',     totalDays: 60,  difficulty: 3, reminderType: '抽象搞笑', reminderTime: '08:00', startDaysAgo: 30,  color: 'amber'  },
      { baseName: '睡前刷书',    totalDays: 90,  difficulty: 2, reminderType: '乖巧卖萌', reminderTime: '22:30', startDaysAgo: 50,  color: 'lavender' },
    ],
  },
  // 小红：4 个虚拟习惯，中等勤奋（0.80），努力值中下
  {
    id: 'H#r5dY7&jK',
    nickname: '小红',
    color: 'pink',
    virtualProfile: { checkInRatio: 0.80, habitNamePrefix: '小红·' },
    virtualHabits: [
      { baseName: '护肤',       totalDays: 365, difficulty: 2, reminderType: '乖巧卖萌', reminderTime: '22:00', startDaysAgo: 150, color: 'pink'   },
      { baseName: '瑜伽',       totalDays: 90,  difficulty: 3, reminderType: '高冷御姐', reminderTime: '07:30', startDaysAgo: 60,  color: 'coral'  },
      { baseName: '喝 2L 水',   totalDays: 30,  difficulty: 1, reminderType: '抽象搞笑', reminderTime: '10:00', startDaysAgo: 20,  color: 'cyan'   },
      { baseName: '学日语',     totalDays: 180, difficulty: 4, reminderType: '霸道总裁', reminderTime: '21:30', startDaysAgo: 100, color: 'purple' },
    ],
  },
  // 王芳：3 个虚拟习惯，勤奋度低（0.70），努力值低
  {
    id: 'W+f6gT9=hM',
    nickname: '王芳',
    color: 'green',
    virtualProfile: { checkInRatio: 0.70, habitNamePrefix: '王芳·' },
    virtualHabits: [
      { baseName: '散步',       totalDays: 60,  difficulty: 1, reminderType: '高冷御姐', reminderTime: '17:00', startDaysAgo: 30,  color: 'green'  },
      { baseName: '记账',       totalDays: 90,  difficulty: 2, reminderType: '严肃家父', reminderTime: '20:00', startDaysAgo: 40,  color: 'mint'   },
      { baseName: '戒奶茶',     totalDays: 30,  difficulty: 3, reminderType: '抽象搞笑', reminderTime: '15:00', startDaysAgo: 15,  color: 'rose'   },
    ],
  },
  // 小张：1 个虚拟习惯，刚起步（0.95 但习惯很短），努力值最低
  {
    id: 'Z*2nV4!cQb',
    nickname: '小张',
    color: 'amber',
    virtualProfile: { checkInRatio: 0.95, habitNamePrefix: '小张·' },
    virtualHabits: [
      { baseName: '早起',       totalDays: 30,  difficulty: 4, reminderType: '霸道总裁', reminderTime: '06:00', startDaysAgo: 8,   color: 'amber'  },
    ],
  },
];

/** 找候选人按 ID；找不到返回 null */
export function findMockCandidate(id: string): MockCandidate | null {
  return mockCandidates.find((c) => c.id === id) ?? null;
}

/** 找候选人按昵称（用于申请列表展示）；找不到返回 null */
export function findMockCandidateByNickname(
  nickname: string
): MockCandidate | null {
  return mockCandidates.find((c) => c.nickname === nickname) ?? null;
}