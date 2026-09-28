// 重新 pack app.asar，确保 UTF-8 编码（power shell Copy-Item 用了 ANSI）
const { spawnSync } = require('child_process');
const path = require('path');

const root = 'E:\\app初试\\习惯平台application设计\\habit-platform';
const asarBin = path.join(root, 'node_modules', '.bin', 'asar.cmd');
const target = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');

// 1. 验证 dist\electron\main.cjs 编码
const fs = require('fs');
const buf = fs.readFileSync(path.join(root, 'dist', 'electron', 'main.cjs'));
const head = buf.slice(0, 50);
console.log('dist\\electron\\main.cjs first 50 bytes:', head);
console.log('→ is UTF-8?', head.toString('utf8').includes('主进程'));

// 2. Pack
console.log('Packing dist → app.asar...');
const r = spawnSync('cmd', ['/c', asarBin, 'pack', 'dist', target], {
  cwd: root,
  encoding: 'utf8',
});
console.log('stdout:', r.stdout);
console.log('stderr:', r.stderr);
console.log('exit:', r.status);

// 3. 验证
const extractTo = path.join(root, 'verify-extract');
if (fs.existsSync(extractTo)) {
  fs.rmSync(extractTo, { recursive: true });
}
const r2 = spawnSync('cmd', ['/c', asarBin, 'extract', target, extractTo], {
  cwd: root,
  encoding: 'utf8',
});
const mainContent = fs.readFileSync(path.join(extractTo, 'electron', 'main.cjs'), 'utf8');
console.log('--- asar extracted main.cjs first 200 chars ---');
console.log(mainContent.slice(0, 200));
console.log('→ contains 主进程?', mainContent.includes('主进程'));
console.log('→ contains 习惯平台?', mainContent.includes('习惯平台'));
fs.rmSync(extractTo, { recursive: true });