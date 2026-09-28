/**
 * Electron 打包脚本（统一打包流程）
 *
 * 步骤：
 *   1. 跑 vite build（生成 dist/）
 *   2. 复制 electron/ + package.json + music/animations 到 dist/（vite build 会清空非自己产物）
 *   3. asar pack dist → release/win-unpacked/resources/app.asar
 *   4. 7za 打包 → release/星启-v0.0.0-windows-x64.zip
 *
 * 为什么需要这个脚本：
 *   - vite build 的 emptyOutDir=true 会清空 dist/ 里所有非自身产物
 *   - electron/main.cjs、preload.cjs、package.json 必须一起 pack 进 asar
 *     否则 Electron 读 package.json 的 main 字段找不到 main.cjs → 白屏
 *   - mp3 / mp4 资源在 vite build 时被自动复制到 dist/，但 electron 文件需要手动 copy
 *   - 用 7za 而不是 Compress-Archive，更稳定（CN 路径 + 大量文件 + 锁定文件不卡）
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release', 'win-unpacked');
const asarPath = path.join(releaseDir, 'resources', 'app.asar');
const zipPath = path.join(root, 'release', '星启-v0.0.0-windows-x64.zip');
const asarBin = path.join(root, 'node_modules', '.bin', 'asar.cmd');

function step(name, fn) {
  console.log(`\n=== ${name} ===`);
  const r = fn();
  if (r && r.status !== 0) {
    console.error(`✗ ${name} failed (status=${r.status})`);
    process.exit(1);
  }
  console.log(`✓ ${name}`);
}

// 1. vite build
step('1. vite build', () => {
  return spawnSync('cmd', ['/c', 'npm.cmd', 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
});

// 2. 复制 electron/ + package.json 到 dist/
step('2. copy electron/ + package.json → dist/', () => {
  // 确保 dist/electron/ 存在
  const distElectronDir = path.join(distDir, 'electron');
  if (!fs.existsSync(distElectronDir)) {
    fs.mkdirSync(distElectronDir, { recursive: true });
  }
  // 复制 main.cjs + preload.cjs
  fs.copyFileSync(
    path.join(root, 'electron', 'main.cjs'),
    path.join(distElectronDir, 'main.cjs')
  );
  fs.copyFileSync(
    path.join(root, 'electron', 'preload.cjs'),
    path.join(distElectronDir, 'preload.cjs')
  );
  // Module 09（2026-09-26）：复制 icon.ico + icon.png → dist/electron/
  //   - icon.ico 用于 dev 模式运行时加载 + electron-builder NSIS 图标
  //   - icon.png 用于 macOS/Linux（未来扩展）
  const iconIco = path.join(root, 'electron', 'icon.ico');
  if (fs.existsSync(iconIco)) {
    fs.copyFileSync(iconIco, path.join(distElectronDir, 'icon.ico'));
  }
  const iconPng = path.join(root, 'electron', 'icon.png');
  if (fs.existsSync(iconPng)) {
    fs.copyFileSync(iconPng, path.join(distElectronDir, 'icon.png'));
  }
  // 复制 package.json（root 的）
  fs.copyFileSync(
    path.join(root, 'package.json'),
    path.join(distDir, 'package.json')
  );
});

// 3. asar pack
step('3. asar pack dist → release/win-unpacked/resources/app.asar', () => {
  const r = spawnSync(
    'cmd',
    ['/c', asarBin, 'pack', distDir, asarPath],
    { cwd: root, encoding: 'utf8' }
  );
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  return r;
});

// 4. zip（用 7za —— Compress-Archive 对 CN 路径 + 锁定文件不友好）
step('4. 7za → 星启-v0.0.0-windows-x64.zip', () => {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  const sevenZip = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (!fs.existsSync(sevenZip)) {
    console.error('✗ 7za.exe not found at', sevenZip);
    process.exit(1);
  }
  return spawnSync(
    sevenZip,
    ['a', '-tzip', '-mx=5', '-r', zipPath, '.'],
    { cwd: releaseDir, stdio: 'inherit', shell: false }
  );
});

const sizeMB = (fs.statSync(zipPath).length / 1024 / 1024).toFixed(1);
console.log(`\n🎉 打包完成: ${zipPath} (${sizeMB} MB)`);