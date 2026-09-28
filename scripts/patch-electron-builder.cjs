#!/usr/bin/env node
/**
 * patch-electron-builder.cjs
 *
 * Module 09（2026-09-26）：在 npm install 之后给 electron-builder 的两个文件
 * 应用 in-house patch，让 Windows 普通用户能成功做 NSIS / portable build。
 *
 * 为什么需要这个脚本：
 *   1. `7zip-bin` 的默认 `getPath()` 总指向原始 7za.exe，archive 内的 darwin
 *      hardlinks 会让 extract 失败（Windows 无 SeCreateSymbolicLinkPrivilege）。
 *   2. `builder-util` 的 `exec(file, ...)` 在 Node 24+ 上 exec `.cmd` 文件
 *      会抛 `spawn EINVAL`（要 `shell: true`）。
 *
 * 两个 patch 都受 `ELECTRON_BUILDER_7ZA_WRAPPER=true` 控制，gate 在打包时才生效，
 * 平时 `npm run dev` 完全不受影响。
 *
 * patch 内容是 idempotent：每次都基于 "找原 patch 是否已存在" 来决定跳过 / 应用。
 * 所以可以反复跑（npm install postinstall 自动跑，重复无副作用）。
 */

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SEVEN_ZIP_INDEX = path.join(
  ROOT,
  'node_modules',
  '7zip-bin',
  'index.js',
);
const BUILDER_UTIL = path.join(
  ROOT,
  'node_modules',
  'builder-util',
  'out',
  'util.js',
);

const PATCH_MARK_7Z =
  'ELECTRON_BUILDER_7ZA_WRAPPER'; // 我们加在 7zip-bin/index.js 的 sentinel

const PATCH_MARK_BU = '// Module 09（2026-09-26）：Windows 上 .cmd / .bat 文件需要 shell=true';

let applied = 0;
let skipped = 0;

/**
 * Patch 1: 7zip-bin/index.js
 * 在 win32 分支加 ELECTRON_BUILDER_7ZA_WRAPPER 分支指向 scripts/electron-7za.cmd
 */
function patch7zip() {
  if (!fs.existsSync(SEVEN_ZIP_INDEX)) {
    console.log('[patch] (skip) 7zip-bin not installed, skipping');
    return;
  }
  let src = fs.readFileSync(SEVEN_ZIP_INDEX, 'utf8');

  if (src.includes(PATCH_MARK_7Z)) {
    console.log('[patch] (skip) 7zip-bin already patched');
    skipped++;
    return;
  }

  const old = `  else if (process.platform === "win32") {
    return path.join(__dirname, "win", process.arch, "7za.exe")
  }`;
  const neu = `  else if (process.platform === "win32") {
    // Module 09 (2026-09-26): Win 7za wrapper 注入 -snh (skip hardlinks)
    // 解决 7za x -snld 在 archive 内部 darwin/* symlink/hardlink 上失败的问题
    if (process.env.ELECTRON_BUILDER_7ZA_WRAPPER === "true") {
      return path.join(__dirname, "..", "..", "scripts", "electron-7za.cmd")
    }
    return path.join(__dirname, "win", process.arch, "7za.exe")
  }`;

  if (!src.includes(old)) {
    console.warn(
      '[patch] 7zip-bin/index.js shape changed — patch needs review (expected ASCII will not match exactly).',
    );
    return;
  }

  src = src.replace(old, neu);
  fs.writeFileSync(SEVEN_ZIP_INDEX, src, 'utf8');
  console.log('[patch] (apply) 7zip-bin/index.js — ELECTRON_BUILDER_7ZA_WRAPPER branch added');
  applied++;
}

/**
 * Patch 2: builder-util/out/util.js
 * 在 `exec(file, args, options, isLogOutIfDebug = true)` 函数体顶加
 * `shell: true` 让 execFile 能跑 .cmd 文件（Win + Node 24+）
 */
function patchBuilderUtil() {
  if (!fs.existsSync(BUILDER_UTIL)) {
    console.log('[patch] (skip) builder-util not installed, skipping');
    return;
  }
  let src = fs.readFileSync(BUILDER_UTIL, 'utf8');

  if (src.includes(PATCH_MARK_BU)) {
    console.log('[patch] (skip) builder-util already patched');
    skipped++;
    return;
  }

  const old = `function exec(file, args, options, isLogOutIfDebug = true) {
    if (log_1.log.isDebugEnabled) {`;
  const neu = `function exec(file, args, options, isLogOutIfDebug = true) {
    // Module 09（2026-09-26）：Windows 上 .cmd / .bat 文件需要 shell=true（Node 24+）
    //         检查 ELECTRON_BUILDER_7ZA_WRAPPER 环境变量启用 wrapper
    if (process.platform === "win32" && process.env.ELECTRON_BUILDER_7ZA_WRAPPER === "true") {
        options = options || {};
        options = { ...options, shell: true };
    }
    if (log_1.log.isDebugEnabled) {`;

  if (!src.includes(old)) {
    console.warn(
      '[patch] builder-util/out/util.js shape changed — patch needs review.',
    );
    return;
  }

  src = src.replace(old, neu);
  fs.writeFileSync(BUILDER_UTIL, src, 'utf8');
  console.log('[patch] (apply) builder-util/out/util.js — shell: true in exec() for Win wrapper');
  applied++;
}

console.log('[patch-electron-builder] start');
patch7zip();
patchBuilderUtil();
console.log(`[patch-electron-builder] done — applied=${applied}, skipped=${skipped}`);
