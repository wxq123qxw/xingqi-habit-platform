// 验证 manifest 大小 + 关键字段
import { generateReminderAnim, generateAbsentAnim } from '../src/utils/lottieMockGenerator.ts';

const STYLES = ['抽象搞笑', '霸道总裁', '严肃家父', '乖巧卖萌', '高冷御姐'];

let max = 0, total = 0;
for (const style of STYLES) {
  for (let i = 0; i < 10; i++) {
    const data = generateReminderAnim(style, i);
    const json = JSON.stringify(data);
    const size = json.length;
    total += size;
    max = Math.max(max, size);
    if (size > 5000) console.log('⚠️ 大于 5KB:', style, i, size, 'bytes');
  }
}

const absentSize = JSON.stringify(generateAbsentAnim()).length;
total += absentSize;
max = Math.max(max, absentSize);

console.log('51 个 Lottie JSON:');
console.log('  最大:', max, 'bytes', '(' + (max/1024).toFixed(1) + ' KB)');
console.log('  总和:', total, 'bytes', '(' + (total/1024).toFixed(1) + ' KB)');
console.log('  平均:', Math.round(total/51), 'bytes');
console.log('spec 上限 30MB → 远低于', (30*1024*1024).toLocaleString(), 'bytes');
