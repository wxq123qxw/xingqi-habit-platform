/**
 * 动画 Manifest（spec §4.2 —— MP4 路线）
 *
 * 【接口契约】—— 这是替换动画的入口
 *
 * 每个 entry 表示一条提醒动画（或缺勤动画）：
 *   - id:               唯一标识符
 *   - style:            所属提醒风格（5 种）或 'absent'
 *   - index:            该风格下的 0-9 位置
 *   - backgroundColor:  启动背景色（spec §4.2.5：4 色轮转）
 *   - mp4Url:           MP4 视频路径
 *                         - 本地: '/animations/abstract-funny-0.mp4'（Vite public/ 目录）
 *                         - 远程: 'https://cdn.example.com/anim.mp4'
 *
 * 数据来源：你自己填
 *   - 收到产品方提供的 50 + 1 个 MP4 文件后
 *   - 放进 public/animations/ 目录（或传 CDN 拿到 URL）
 *   - 把 URL 填到 ANIMATION_DATA 对应位置
 *
 * 【目前状态】
 *   - ANIMATION_DATA 是空数组（你还没提供资源）
 *   - 入队动画 fallback 到 /animations/1.mp4 / 2.mp4 + 4 色随机
 *
 * 【填入示例】（编辑本文件下方）
 *   ANIMATION_DATA.push(
 *     { id: 'anim-抽象搞笑-0', style: '抽象搞笑', index: 0, backgroundColor: 'mint', mp4Url: '/animations/abstract-funny-0.mp4' },
 *     { id: 'anim-抽象搞笑-1', style: '抽象搞笑', index: 1, backgroundColor: 'sky',  mp4Url: '/animations/abstract-funny-1.mp4' },
 *     // ... 共 50 条（spec §4.2.5 要求每种风格下 10 张背景图颜色分布均衡）
 *   );
 */

import type { ReminderType } from '../types/habit';

// ============================================================
// 背景色枚举（spec §4.2.5）
// ============================================================

export type AnimBackgroundColor = 'mint' | 'sky' | 'stone' | 'white';

export const BG_COLOR_CLASS: Record<AnimBackgroundColor, string> = {
  mint: 'bg-emerald-50',
  sky: 'bg-sky-50',
  stone: 'bg-stone-100',
  white: 'bg-white',
};

// ============================================================
// Manifest entry 契约
// ============================================================

export interface AnimationEntry {
  id: string;
  style: ReminderType | 'absent';
  index: number;
  backgroundColor: AnimBackgroundColor;
  /**
   * MP4 视频路径。
   * - 本地相对路径例：'/animations/abstract-funny-0.mp4'（Vite public/ 目录）
   * - 远程 URL 例：'https://cdn.habitapp.com/animations/abstract-funny-0.mp4'
   */
  mp4Url: string;
}

// ============================================================
// 数据（mutable + 不导出赋值接口，只读导出引用）
// ============================================================

/**
 * 40 条提醒动画容器（按 reminderType 分类，4 色背景均衡）。
 * 数组引用是稳定的，业务代码 import 后能看到后续 push 的条目。
 *
 * 文件分布（spec §4.2）：
 *   - 抽象搞笑：1.mp4 - 11.mp4（11 条）
 *   - 霸道总裁：12.mp4 - 18.mp4（7 条）
 *   - 严肃家父：19.mp4 - 22.mp4（4 条）
 *   - 乖巧卖萌：23.mp4 - 35.mp4（13 条）
 *   - 高冷御姐：36.mp4 - 40.mp4（5 条）
 *   - 合计：40 条
 *
 * 背景色按 spec §4.2.5：浅绿 / 天蓝 / 米色 / 纯白 均衡分配。
 */
export const ANIMATION_DATA: AnimationEntry[] = [
  // ============ 抽象搞笑（11 条）=========== mint 3 / sky 3 / stone 3 / white 2
  { id: 'anim-抽象搞笑-0', style: '抽象搞笑', index: 0, backgroundColor: 'mint', mp4Url: '/animations/1.mp4' },
  { id: 'anim-抽象搞笑-1', style: '抽象搞笑', index: 1, backgroundColor: 'sky', mp4Url: '/animations/2.mp4' },
  { id: 'anim-抽象搞笑-2', style: '抽象搞笑', index: 2, backgroundColor: 'stone', mp4Url: '/animations/3.mp4' },
  { id: 'anim-抽象搞笑-3', style: '抽象搞笑', index: 3, backgroundColor: 'white', mp4Url: '/animations/4.mp4' },
  { id: 'anim-抽象搞笑-4', style: '抽象搞笑', index: 4, backgroundColor: 'mint', mp4Url: '/animations/5.mp4' },
  { id: 'anim-抽象搞笑-5', style: '抽象搞笑', index: 5, backgroundColor: 'sky', mp4Url: '/animations/6.mp4' },
  { id: 'anim-抽象搞笑-6', style: '抽象搞笑', index: 6, backgroundColor: 'stone', mp4Url: '/animations/7.mp4' },
  { id: 'anim-抽象搞笑-7', style: '抽象搞笑', index: 7, backgroundColor: 'mint', mp4Url: '/animations/8.mp4' },
  { id: 'anim-抽象搞笑-8', style: '抽象搞笑', index: 8, backgroundColor: 'sky', mp4Url: '/animations/9.mp4' },
  { id: 'anim-抽象搞笑-9', style: '抽象搞笑', index: 9, backgroundColor: 'stone', mp4Url: '/animations/10.mp4' },
  { id: 'anim-抽象搞笑-10', style: '抽象搞笑', index: 10, backgroundColor: 'white', mp4Url: '/animations/11.mp4' },

  // ============ 霸道总裁（7 条）=========== mint 2 / sky 2 / stone 2 / white 1
  { id: 'anim-霸道总裁-0', style: '霸道总裁', index: 0, backgroundColor: 'mint', mp4Url: '/animations/12.mp4' },
  { id: 'anim-霸道总裁-1', style: '霸道总裁', index: 1, backgroundColor: 'sky', mp4Url: '/animations/13.mp4' },
  { id: 'anim-霸道总裁-2', style: '霸道总裁', index: 2, backgroundColor: 'stone', mp4Url: '/animations/14.mp4' },
  { id: 'anim-霸道总裁-3', style: '霸道总裁', index: 3, backgroundColor: 'white', mp4Url: '/animations/15.mp4' },
  { id: 'anim-霸道总裁-4', style: '霸道总裁', index: 4, backgroundColor: 'mint', mp4Url: '/animations/16.mp4' },
  { id: 'anim-霸道总裁-5', style: '霸道总裁', index: 5, backgroundColor: 'sky', mp4Url: '/animations/17.mp4' },
  { id: 'anim-霸道总裁-6', style: '霸道总裁', index: 6, backgroundColor: 'stone', mp4Url: '/animations/18.mp4' },

  // ============ 严肃家父（4 条）=========== mint 1 / sky 1 / stone 1 / white 1
  { id: 'anim-严肃家父-0', style: '严肃家父', index: 0, backgroundColor: 'mint', mp4Url: '/animations/19.mp4' },
  { id: 'anim-严肃家父-1', style: '严肃家父', index: 1, backgroundColor: 'sky', mp4Url: '/animations/20.mp4' },
  { id: 'anim-严肃家父-2', style: '严肃家父', index: 2, backgroundColor: 'stone', mp4Url: '/animations/21.mp4' },
  { id: 'anim-严肃家父-3', style: '严肃家父', index: 3, backgroundColor: 'white', mp4Url: '/animations/22.mp4' },

  // ============ 乖巧卖萌（13 条）=========== mint 3 / sky 3 / stone 4 / white 3
  { id: 'anim-乖巧卖萌-0', style: '乖巧卖萌', index: 0, backgroundColor: 'mint', mp4Url: '/animations/23.mp4' },
  { id: 'anim-乖巧卖萌-1', style: '乖巧卖萌', index: 1, backgroundColor: 'sky', mp4Url: '/animations/24.mp4' },
  { id: 'anim-乖巧卖萌-2', style: '乖巧卖萌', index: 2, backgroundColor: 'stone', mp4Url: '/animations/25.mp4' },
  { id: 'anim-乖巧卖萌-3', style: '乖巧卖萌', index: 3, backgroundColor: 'white', mp4Url: '/animations/26.mp4' },
  { id: 'anim-乖巧卖萌-4', style: '乖巧卖萌', index: 4, backgroundColor: 'mint', mp4Url: '/animations/27.mp4' },
  { id: 'anim-乖巧卖萌-5', style: '乖巧卖萌', index: 5, backgroundColor: 'sky', mp4Url: '/animations/28.mp4' },
  { id: 'anim-乖巧卖萌-6', style: '乖巧卖萌', index: 6, backgroundColor: 'stone', mp4Url: '/animations/29.mp4' },
  { id: 'anim-乖巧卖萌-7', style: '乖巧卖萌', index: 7, backgroundColor: 'mint', mp4Url: '/animations/30.mp4' },
  { id: 'anim-乖巧卖萌-8', style: '乖巧卖萌', index: 8, backgroundColor: 'sky', mp4Url: '/animations/31.mp4' },
  { id: 'anim-乖巧卖萌-9', style: '乖巧卖萌', index: 9, backgroundColor: 'stone', mp4Url: '/animations/32.mp4' },
  { id: 'anim-乖巧卖萌-10', style: '乖巧卖萌', index: 10, backgroundColor: 'white', mp4Url: '/animations/33.mp4' },
  { id: 'anim-乖巧卖萌-11', style: '乖巧卖萌', index: 11, backgroundColor: 'mint', mp4Url: '/animations/34.mp4' },
  { id: 'anim-乖巧卖萌-12', style: '乖巧卖萌', index: 12, backgroundColor: 'sky', mp4Url: '/animations/35.mp4' },

  // ============ 高冷御姐（5 条）=========== mint 1 / sky 1 / stone 2 / white 1
  { id: 'anim-高冷御姐-0', style: '高冷御姐', index: 0, backgroundColor: 'mint', mp4Url: '/animations/36.mp4' },
  { id: 'anim-高冷御姐-1', style: '高冷御姐', index: 1, backgroundColor: 'sky', mp4Url: '/animations/37.mp4' },
  { id: 'anim-高冷御姐-2', style: '高冷御姐', index: 2, backgroundColor: 'stone', mp4Url: '/animations/38.mp4' },
  { id: 'anim-高冷御姐-3', style: '高冷御姐', index: 3, backgroundColor: 'stone', mp4Url: '/animations/39.mp4' },
  { id: 'anim-高冷御姐-4', style: '高冷御姐', index: 4, backgroundColor: 'white', mp4Url: '/animations/40.mp4' },
];

// ============================================================
// 派生函数（按风格过滤 / 抽卡）
// ============================================================

/** 按风格过滤提醒动画 */
export function getAnimationsByStyle(style: ReminderType): AnimationEntry[] {
  return ANIMATION_DATA.filter((a) => a.style === style);
}

/**
 * 抽卡（spec §4.2.2）：
 *   从指定风格的 10 个动画里随机抽 1 个（真正随机，允许重复）
 *
 * @throws 如果该风格没有任何动画（manifest 还没接资源时）
 */
export function pickRandomAnimation(style: ReminderType): AnimationEntry {
  const candidates = getAnimationsByStyle(style);
  if (candidates.length === 0) {
    throw new Error(
      `pickRandomAnimation: 没有 "${style}" 的动画，请先在 animationManifest.ts 中 push 数据`
    );
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 抽卡 + Fallback（spec §4.2.2 + §4.2.5）：
 *
 *   - manifest 有该风格动画 → 真正随机抽取 1 个（允许重复）
 *   - manifest 暂时没接资源（dev 阶段） → Fallback：用 /animations/1.mp4 / 2.mp4 兜底
 *     + backgroundColor 从 4 色中**真随机抽取**（spec §4.2.5 浅绿/天蓝/米色/纯白均衡）
 *
 * 用途：App.tsx 推送 effect 调用——避免 manifest 为空时整个推送崩
 *
 * 注意：spec §4.2.5 要求"每种风格下 10 张背景图颜色分布均衡"——manifest 有数据时
 * 由 manifest 维护者保证。fallback 这里只保证每次真随机抽 mp4 和颜色。
 */
export function pickAnimationOrFallback(style: ReminderType): AnimationEntry {
  const candidates = getAnimationsByStyle(style);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fallback：mp4 真随机 1/2，背景色真随机 4 色
  const mp4Files = ['/animations/1.mp4', '/animations/2.mp4'];
  const mp4Url = mp4Files[Math.floor(Math.random() * mp4Files.length)];
  const colors: AnimBackgroundColor[] = ['mint', 'sky', 'stone', 'white'];
  const backgroundColor = colors[Math.floor(Math.random() * colors.length)];

  return {
    id: `fallback-${style}-${mp4Url}-${Date.now()}`,
    style,
    index: -1,
    backgroundColor,
    mp4Url,
  };
}

/**
 * 缺勤动画获取（Phase 2.3.3）：
 *   - setAbsentAnimation() 已设置 → 返回该 entry
 *   - 没设置 → fallback 到 /animations/2.mp4（背景固定 stone，spec §4.3）
 *
 * 用途：runDailyAbsentCheck 检测到缺勤时入队
 */
export function getAbsentAnimationOrFallback(): AnimationEntry {
  // Module 06 简化：用户取消了缺勤动画，只算缺勤次数
  // 这里保留函数作为"将来扩展"的占位，直接返回 stone 背景的 fallback
  return {
    id: 'fallback-absent',
    style: 'absent',
    index: -1,
    backgroundColor: 'stone',
    mp4Url: '/animations/2.mp4',
  };
}
