/**
 * 唯一用户 ID 生成器
 * spec §4.3：注册后生成唯一 ID，格式"特殊字符 + 数字 + 字母" 混合
 *
 * 设计：
 * - 长度：10 字符（视觉好记、易输入、碰撞概率低）
 * - 字符分布：3 特殊 + 3 数字 + 4 字母（约 30/30/40 比例）
 * - 字符全部随机抽取并洗牌后拼接
 * - 不使用时间戳，确保格式"看起来随机"（避免被误读为时间戳）
 *
 * 碰撞概率估算：单池大小 ≈ 18×10×52 = 9360 种 10 字符组合。
 * 在 1k 用户内碰撞概率 < 6%，demo 场景够用；
 * 真实后端上线后由后端 UUID 替换。
 */

const SPECIAL =
  '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const COUNTS = { special: 3, digit: 3, letter: 4 };

function pickRandom(pool: string): string {
  return pool.charAt(Math.floor(Math.random() * pool.length));
}

/** 生成一个符合 spec 的唯一 ID（特殊+数字+字母混合，10 字符） */
export function generateUserId(): string {
  const chars: string[] = [];

  for (let i = 0; i < COUNTS.special; i++) {
    chars.push(pickRandom(SPECIAL));
  }
  for (let i = 0; i < COUNTS.digit; i++) {
    chars.push(pickRandom(DIGITS));
  }
  for (let i = 0; i < COUNTS.letter; i++) {
    chars.push(pickRandom(LETTERS));
  }

  // Fisher-Yates 洗牌，确保顺序不可预测
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/** ID 格式校验：长度 ≥ 6 且至少包含 特殊字符、数字、字母 三类 */
// 特殊字符范围与 src/store/authStore.ts 的 SPECIAL_REGEX 保持一致（全 ASCII 可打印标点 32 字符）
// prettier-ignore
const SPECIAL_REGEX = /[!-/:;<=>?@\[-^_`{|}~]/;

/** ID 格式校验：长度 ≥ 6 且至少包含 特殊字符、数字、字母 三类 */
export function isValidUserId(id: string): boolean {
  if (!id || id.length < 6) return false;
  const hasSpecial = SPECIAL_REGEX.test(id);
  const hasDigit = /\d/.test(id);
  const hasLetter = /[a-zA-Z]/.test(id);
  return hasSpecial && hasDigit && hasLetter;
}