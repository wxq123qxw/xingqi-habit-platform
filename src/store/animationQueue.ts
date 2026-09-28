/**
 * 动画队列 store（spec §4.2.4 + §4.3.2）—— 重构版（Phase 2.1 根因修复）
 *
 * 【设计核心】单一真相源 —— 队列 + 当前在播都由 store 维护
 *
 * 数据结构：QueueState
 *   - queue:   待播队列（frozen）
 *   - current: 正在播的动画（null = 没在播）
 *
 * 为什么把 current 也放在 store 里：
 *   - 之前用 AnimationQueuePlayer 内部 useState 持有 item 时，
 *     "最后一条 onComplete" 会同时把 queue 减到 0 + setItem(null)。
 *     React commit 时 App 看到 queue=0 立即卸载 BootScreen，
 *     导致当前正在播的视频被打断。
 *   - 把 current 提到 store 后，App 判断 bootActive = queue>0 || current!==null，
 *     最后一条视频在 current 里，queue 提前变 0 也不会卸载 BootScreen，
 *     直到 completeCurrent() 把 current 也置 null。
 *
 * API：
 *   - enqueueAnimation:     入队（如果当前没在播，自动 shift 第一条作为 current）
 *   - completeCurrent:      当前视频播完 → shift 下一条作 current（可能为 null）
 *   - shiftAnimation:       保留（向下兼容 / 调试用）：直接 shift queue 队头
 *   - peekAnimation:        偷看 queue 队头
 *   - clearAnimationQueue:  清空 queue 和 current
 *   - getAnimationQueueSnapshot: 读快照
 *   - subscribeAnimationQueue:   订阅
 *
 * 部署：
 *   - 内存单例（demo 阶段足够）
 *   - 模块 07 真后端上线后，这个 store 改成从后端拉队列
 */

import type { AnimBackgroundColor } from '../data/animationManifest';
import type { ReminderType } from '../types/habit';

// ============================================================
// 队列元素契约
// ============================================================

export interface QueuedAnimation {
  /** 唯一标识（key 用，切换动画时强制重 mount 重新 load） */
  id: string;
  /** MP4 视频路径（必填） */
  mp4Url: string;
  /** 启动层背景色（spec §4.2.5） */
  backgroundColor: AnimBackgroundColor;
  /** 习惯名（Phase 4 给文案用，可选） */
  habitName?: string;
  /** 提醒风格（Phase 4 给文案用，可选） */
  reminderType?: ReminderType;
}

// ============================================================
// 状态契约（snapshot 暴露给消费方）
// ============================================================

export interface QueueState {
  /** 待播队列（frozen） */
  queue: readonly QueuedAnimation[];
  /** 当前正在播（null = 没在播） */
  current: QueuedAnimation | null;
}

// ============================================================
// 内部 state
// ============================================================

/** 真实待播队列（mutable 数组） */
const pendingQueue: QueuedAnimation[] = [];

/** 当前正在播的动画（mutable，单值） */
let currentItem: QueuedAnimation | null = null;

/**
 * 快照缓存：每次 mutation 后生成一个新引用并 Object.freeze。
 * useSyncExternalStore 通过 Object.is 检测引用变化。
 */
let snapshotCache: QueueState = Object.freeze({
  queue: Object.freeze([]) as readonly QueuedAnimation[],
  current: null,
});

/** 订阅者集合 */
type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * 重新生成 snapshot + 异步通知所有 listener。
 *
 * 用 queueMicrotask 异步触发，避免 mutation flow 中嵌套调用其他组件
 * 的 setState（React 18 setstate-in-render 警告）。
 */
function refreshSnapshotAndNotify(): void {
  snapshotCache = Object.freeze({
    queue: Object.freeze(pendingQueue.slice()) as readonly QueuedAnimation[],
    current: currentItem,
  });
  for (const fn of listeners) {
    queueMicrotask(() => {
      try {
        fn();
      } catch (e) {
        console.error('animationQueue listener error', e);
      }
    });
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * 订阅 snapshot 变化。
 * 用法：useSyncExternalStore(subscribeAnimationQueue, getAnimationQueueSnapshot)
 */
export function subscribeAnimationQueue(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** 读当前 snapshot（frozen，每次 mutation 后是新引用） */
export function getAnimationQueueSnapshot(): QueueState {
  return snapshotCache;
}

/**
 * 入队（push 到末尾）。
 *
 * 副作用：
 *   - 如果当前没在播（current === null），自动从队头 shift 一条作 current。
 *     这样入队后立即触发 App 显示 BootScreen + AnimationQueuePlayer 渲染。
 *   - notify 所有 listener。
 */
export function enqueueAnimation(anim: QueuedAnimation): void {
  pendingQueue.push(anim);
  if (currentItem === null) {
    currentItem = pendingQueue.shift() ?? null;
  }
  refreshSnapshotAndNotify();
}

/**
 * 当前视频播完 → shift 下一条作 current。
 *
 * 行为：
 *   - 如果 queue 非空 → 取队头作 current，queue 减少 1
 *   - 如果 queue 空 → current 置 null
 *   - notify
 *
 * 这是 AnimationQueuePlayer 在 onComplete 调用的唯一驱动方法。
 */
export function completeCurrent(): void {
  if (currentItem === null) return;
  currentItem = pendingQueue.shift() ?? null;
  refreshSnapshotAndNotify();
}

/**
 * 用户主动跳过当前（"下一条"按钮）
 *
 * 行为与 completeCurrent 完全相同——区别只在语义：
 *   - completeCurrent：视频自然播完
 *   - skipCurrent：用户主动跳过
 *
 * BootScreen 的"下一条"按钮调这个。当前是空队列时无副作用。
 */
export function skipCurrent(): void {
  if (currentItem === null) return;
  currentItem = pendingQueue.shift() ?? null;
  refreshSnapshotAndNotify();
}

/**
 * 直接 shift 队头（保留 API，向下兼容 / Phase 2.1 早期用）。
 * Phase 2.2+ 之后 AnimationQueuePlayer 不再使用 —— 用 completeCurrent 替代。
 *
 * @deprecated 推荐用 completeCurrent()
 */
export function shiftAnimation(): QueuedAnimation | undefined {
  const item = pendingQueue.shift();
  if (item !== undefined) {
    if (currentItem === null) {
      currentItem = item;
    }
    refreshSnapshotAndNotify();
  }
  return item;
}

/** 偷看队头（不移除） */
export function peekAnimation(): QueuedAnimation | undefined {
  return pendingQueue[0];
}

/**
 * 清空全部（spec §4.3.2：缺勤触发时清空正常提醒队列）。
 * 同时把 current 置 null。
 */
export function clearAnimationQueue(): void {
  if (pendingQueue.length === 0 && currentItem === null) return;
  pendingQueue.length = 0;
  currentItem = null;
  refreshSnapshotAndNotify();
}

// ============================================================
// Debug（仅开发期）
// ============================================================

if (typeof window !== 'undefined') {
  // 浏览器 console 里跑：
  //   __aq.queue()       → 待播队列数组
  //   __aq.length()      → 待播队列长度
  //   __aq.current()     → 当前正在播（null 或 QueuedAnimation）
  //   __aq.state()       → 完整 { queue, current }
  //   __aq.clear()       → 清空
  (window as unknown as { __aq: unknown }).__aq = {
    queue: () => pendingQueue.slice(),
    length: () => pendingQueue.length,
    current: () => currentItem,
    state: () => ({
      queue: pendingQueue.slice(),
      current: currentItem,
    }),
    clear: () => clearAnimationQueue(),
  };
}