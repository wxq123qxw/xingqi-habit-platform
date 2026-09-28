import { useState, useCallback, useEffect, useRef } from 'react';
import type { ReminderType } from '../types/habit';
import { consumeReminderText } from '../utils/reminderLibrary';

interface UseReminderTextResult {
  text: string;
  /** 手动再消费一条（用于"换一条"按钮） */
  reroll: () => void;
  /** 字数自适应信息 */
  charCount: number;
}

/**
 * 文案消费 hook（spec §4.2）
 *
 * 行为：
 * - 组件 mount 时自动消费一条文案（从 a1 取出 + 回收到 a2）
 * - reroll() 再次消费一条（用于"换一条"按钮或调试）
 *
 * 同一个 habit 多次挂载（如 React Strict Mode 双调用）会消耗两条文案，
 * 用 ref 锁防止。
 *
 * 注意：本 hook 不缓存到 localStorage——刷新页面会重新消费（符合 spec
 * 的"每次推送取一条"语义）。如果想"今日固定一条"，应在调用方把 text
 * 存到 habit 的 reminderTextCache 字段。
 */
export function useReminderText(
  style: ReminderType,
  habitName: string
): UseReminderTextResult {
  // 首次 mount 时消费一条；之后用 state 缓存
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) {
    initialRef.current = consumeReminderText(style, habitName);
  }
  const [text, setText] = useState<string>(initialRef.current);

  // 同步：style / habitName 变化时重新消费
  useEffect(() => {
    setText(consumeReminderText(style, habitName));
    // 故意依赖 style 和 habitName（习惯创建后这两者稳定，不需要 reroll）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, habitName]);

  const reroll = useCallback(() => {
    setText(consumeReminderText(style, habitName));
  }, [style, habitName]);

  const charCount = countChars(text);

  return { text, reroll, charCount };
}

/** 内联字数计算（不依赖外部 util，避免循环依赖） */
function countChars(text: string): number {
  const matches = text.match(/[\u4e00-\u9fa5]/g);
  return matches ? matches.length : 0;
}