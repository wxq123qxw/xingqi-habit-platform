/**
 * 文本格式化工具（spec §4.1.2）
 *
 * 文案字号自适应：
 * - 5-8 字 → text-2xl (24px)
 * - 9-12 字 → text-xl  (20px)
 * - 13-15 字 → text-base (16px)
 *
 * 字数只算汉字（含数字、字母、标点不计入"汉字字数"）。
 * 兜底通用模板也用同样的换算规则。
 */

const HAN_REGEX = /[\u4e00-\u9fa5]/g;

/** 统计汉字字数（中文标点不计入） */
export function countHanChars(text: string): number {
  const matches = text.match(HAN_REGEX);
  return matches ? matches.length : 0;
}

/**
 * spec §4.1.2 字号映射
 * @param charCount 汉字字数
 * @returns Tailwind className（默认字体加粗，视觉重量匹配大字号）
 */
export function getFontSizeClass(charCount: number): string {
  if (charCount <= 8) return 'text-2xl font-semibold';    // 24px
  if (charCount <= 12) return 'text-xl font-semibold';    // 20px
  return 'text-base font-medium';                          // 16px
}

/**
 * 字数映射（inline style 形式，更精确）
 * 备用：有些场景不想用 Tailwind className（比如要传 px 到子组件）
 */
export function getFontSizePx(charCount: number): number {
  if (charCount <= 8) return 24;
  if (charCount <= 12) return 20;
  return 16;
}

/**
 * 完整计算：返回字数 + 推荐 className
 */
export interface TextFit {
  charCount: number;
  fontSizeClass: string;
  fontSizePx: number;
}

export function fitText(text: string): TextFit {
  const charCount = countHanChars(text);
  return {
    charCount,
    fontSizeClass: getFontSizeClass(charCount),
    fontSizePx: getFontSizePx(charCount),
  };
}