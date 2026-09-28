import type { ReminderType } from '../types/habit';
import {
  REMINDER_SEEDS,
  FALLBACK_TEMPLATES,
  fillFallbackTemplate,
} from '../data/reminderSeeds';

/**
 * 文案双存储库机制（spec §4.2）
 *
 * 数据结构：每个 (style, library) 对应一个字符串，文案用 $%$ 分隔
 * - a1: 当前输出库（消费从这里取）
 * - a2: 回收库（消费过的进这里）
 *
 * 轮换规则（spec §4.2.2）：
 *   1. 启动时 a1 用种子文案初始化
 *   2. 取文案：a1.shift() → 返回 + 写入 a2
 *   3. a1 数量 = 0 → 切换 a1↔a2，从新 a1 取出
 *   4. 真实后端每 6 个月重置两个库，前端 hardcoded 兜底
 *
 * 边界处理：
 * - 取文案时若 a1 + a2 都为空（极端边界，比如多次 LLM 失败）：回退到通用模板
 */

const SEPARATOR = '$%$';

interface LibraryStore {
  a1: string;
  a2: string;
}

/** 内存里的文案库（key 是风格） */
const libraryStore: Partial<Record<ReminderType, LibraryStore>> = {};

/**
 * 把存储字符串转成文案数组
 */
function parseLibrary(library: string): string[] {
  if (!library) return [];
  return library.split(SEPARATOR).filter((s) => s.trim().length > 0);
}

/**
 * 把文案数组合并成存储字符串
 */
function serializeLibrary(items: string[]): string {
  return items.join(SEPARATOR);
}

/**
 * 初始化指定风格的库（用种子文案填满 a1，a2 空）
 * 已初始化过则跳过（幂等）
 */
function ensureInitialized(style: ReminderType): void {
  if (libraryStore[style]) return;
  libraryStore[style] = {
    a1: REMINDER_SEEDS[style],
    a2: '',
  };
}

/**
 * 取一条文案（spec §4.2.2 流程 2-3）
 * - 优先从 a1 取
 * - a1 为空时切换 a1↔a2，从新 a1 取
 * - 都为空时回退到通用模板（spec §4.1.3）
 */
export function consumeReminderText(
  style: ReminderType,
  habitName: string
): string {
  ensureInitialized(style);
  const lib = libraryStore[style]!;

  let a1Items = parseLibrary(lib.a1);
  let a2Items = parseLibrary(lib.a2);

  // a1 为空 → 切换 a1↔a2（流程 3）
  if (a1Items.length === 0) {
    if (a2Items.length === 0) {
      // a1 + a2 都空 → 通用兜底
      const idx = Math.floor(Math.random() * FALLBACK_TEMPLATES.length);
      return fillFallbackTemplate(FALLBACK_TEMPLATES[idx], habitName);
    }
    // 切换：新 a1 = 原 a2
    a1Items = a2Items;
    a2Items = [];
    lib.a1 = serializeLibrary(a1Items);
    lib.a2 = serializeLibrary(a2Items);
  }

  // 取出第一条，删除 a1，追加到 a2（流程 2）
  const text = a1Items.shift()!;
  a2Items.push(text);
  lib.a1 = serializeLibrary(a1Items);
  lib.a2 = serializeLibrary(a2Items);

  return text;
}

/**
 * 把消费过的文案**重新放回** a1 头部（用于"取消打卡"回滚场景，spec 未明确，但合理）
 * - 如果该文案不在 a2 里：不操作
 */
export function returnReminderText(
  style: ReminderType,
  text: string
): boolean {
  ensureInitialized(style);
  const lib = libraryStore[style]!;
  let a1Items = parseLibrary(lib.a1);
  let a2Items = parseLibrary(lib.a2);

  const idx = a2Items.indexOf(text);
  if (idx === -1) return false;
  a2Items.splice(idx, 1);
  a1Items.unshift(text);
  lib.a1 = serializeLibrary(a1Items);
  lib.a2 = serializeLibrary(a2Items);
  return true;
}

/**
 * 调试用：查看当前库的剩余条数
 */
export function debugLibraryStatus(): Record<
  ReminderType,
  { a1: number; a2: number }
> {
  const status: Partial<Record<ReminderType, { a1: number; a2: number }>> = {};
  for (const style of Object.keys(REMINDER_SEEDS) as ReminderType[]) {
    ensureInitialized(style);
    const lib = libraryStore[style]!;
    status[style] = {
      a1: parseLibrary(lib.a1).length,
      a2: parseLibrary(lib.a2).length,
    };
  }
  return status as Record<ReminderType, { a1: number; a2: number }>;
}

/**
 * 重置所有库到初始状态（用户"立即测试"按钮 / 调试用）
 */
export function resetAllLibraries(): void {
  for (const key of Object.keys(libraryStore) as ReminderType[]) {
    delete libraryStore[key];
  }
}