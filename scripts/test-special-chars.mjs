// 验证：特殊字符集是否包含用户列出的所有 ASCII 标点
const SPECIAL = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
console.log('SPECIAL pool length:', SPECIAL.length);
console.log('Pool chars:', JSON.stringify(SPECIAL));

// 验证 regex [!-/:;<=>?@\[-^_`{|}~]
// prettier-ignore
const RE = /[!-/:;<=>?@\[-^_`{|}~]/;

console.log('\n=== 所有 ASCII 0x21-0x7E 中能被 regex 匹配的非字母数字字符 ===');
const matched = [];
const missed = [];
for (let c = 0x21; c <= 0x7e; c++) {
  const ch = String.fromCharCode(c);
  if (/[a-zA-Z0-9]/.test(ch)) continue; // 跳过字母数字
  if (RE.test(ch)) matched.push(ch);
  else missed.push(ch);
}

console.log('matched (count=' + matched.length + '):', JSON.stringify(matched.join('')));
console.log('missed (count=' + missed.length + '):', JSON.stringify(missed.join('')));

// 用户列出的特殊符号验证
const userList = '()|^`[]:"/,\';|_{}<>';
let allMatched = true;
for (const ch of userList) {
  if (!RE.test(ch)) {
    console.log('❌ 用户字符未匹配:', JSON.stringify(ch));
    allMatched = false;
  }
}
console.log('\n用户列表全部被匹配?', allMatched);

// isValidPassword 等价测试
function isValidPassword(pwd) {
  if (!pwd || pwd.length < 6) return false;
  const hasSpecial = RE.test(pwd);
  const hasDigit = /\d/.test(pwd);
  const hasLetter = /[a-zA-Z]/.test(pwd);
  return hasSpecial && hasDigit && hasLetter;
}

console.log('\n=== 密码校验实测 ===');
const cases = [
  ['abc123()', true],   // 含 ( 和 )
  ['ABC123<>', true],   // 含 < 和 >
  ['abc123[]', true],   // 含 [ 和 ]
  ['abc123{}', true],   // 含 { 和 }
  ['abc123|!@#', true], // 含 | ! @
  ['abc12345', false],  // 无特殊字符
  ['ABCDEFG!', false],  // 无数字
];
for (const [pwd, expected] of cases) {
  const actual = isValidPassword(pwd);
  console.log(`${pwd.padEnd(12)} → ${actual} ${actual === expected ? '✅' : '❌ expected ' + expected}`);
}
