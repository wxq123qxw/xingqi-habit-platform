import type { HabitColor } from '../types/habit';

// 重新导出 HabitColor（让 ColorSwatchPicker / 其他文件可以从 utils/colors 直接 import）
export type { HabitColor };

// 18 色板：3 行 × 6 列，按色相由暖到冷排列
export const COLOR_HEX: Record<HabitColor, string> = {
  // Row 1: 暖色（红 → 琥珀）
  red:      '#E85F5C',
  rose:     '#F4A89A',
  pink:     '#F0B4D0',
  coral:    '#FF8A65',
  orange:   '#F2B89C',
  amber:    '#F5D47A',
  // Row 2: 黄绿 → 青
  yellow:   '#FFE082',
  lime:     '#C5E1A5',
  mint:     '#A8E0C5',
  green:    '#7FA77E',
  teal:     '#9BC8C0',
  cyan:     '#80DEEA',
  // Row 3: 天蓝 → 灰蓝
  sky:      '#8EC5F0',
  blue:     '#64B5F6',
  indigo:   '#7B9DDB',
  lavender: '#B4A8E0',
  purple:   '#9B7FDB',
  slate:    '#8E9AAB',
};

/** 深色底的卡片（需用白字保证可读） */
const DARK_BG_COLORS = new Set<HabitColor>(['indigo', 'blue', 'purple', 'red', 'green', 'slate']);

/** 文字颜色 class：浅底→深字；深底→白字 */
export function getMainTextClass(color: HabitColor): string {
  return DARK_BG_COLORS.has(color) ? 'text-white' : 'text-gray-900';
}

/** 是否深色底 */
export function isDarkBg(color: HabitColor): boolean {
  return DARK_BG_COLORS.has(color);
}