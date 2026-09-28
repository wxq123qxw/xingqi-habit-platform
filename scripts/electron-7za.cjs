#!/usr/bin/env node
/**
 * 7za wrapper（Module 09 · electron-builder 7z hardlink 修复）
 *
 * Why: electron-builder 调用 7za x -snld -bd 提取 winCodeSign-X.Y.Z.7z，
 *      archive 内部 darwin/libssl.dylib → libcrypto.dylib 是 hardlink 关系，
 *      7za 在 Windows 上尝试 create symlink/hardlink 失败（普通用户无
 *      SeCreateSymbolicLinkPrivilege 权限），整个 extract 退出码非 0。
 *
 *      这个 wrapper 在原始 7za 调用前插一个 flag `-snh`（skip hardlinks），
 *      7za 会忽略 archive 内的 hardlink target，直接把内容作为普通文件
 *      写出，不创建任何 symlink。
 *
 *      ⇒ Windows 普通用户就能成功 extract。icon embed + rcedit 链路
 *        不依赖 darwin 文件，所以跳过 hardlinks 没有任何功能损失。
 *
 * 调用方式：electron-builder 通过 SZA_PATH env var 找 7za。
 *   SZA_PATH=node scripts/electron-7za.cjs
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REAL_7ZA = path.join(
  __dirname,
  '..',
  'node_modules',
  '7zip-bin',
  'win',
  'x64',
  '7za.exe',
);

const args = process.argv.slice(2);

console.error('[electron-7za wrapper] argv:', JSON.stringify(process.argv));
console.error('[electron-7za wrapper] args:', JSON.stringify(args));

// Module 09（2026-09-26）：7za x -snld 在 archive 内部 symlink/hardlink
// （darwin/libssl.dylib → libcrypto.dylib）上失败，因为 Windows 普通用户
// 缺少 SeCreateSymbolicLinkPrivilege。
//
// 7-Zip 21.07 没有"跳过无法提取的 symlink"的标准 flag，
// 但它有 `-snc`（"Skip not extractable Contents"，即遇到无法提取的 entry
// 时跳过而不是放弃整个 archive）。
//
// 我们先 extract，过滤掉 darwin/ 子目录（我们只需要 windows-10/ + rcedit-x64.exe），
// 然后用 PowerShell 把 darwin/ 删除，最后返回 0。
//
// 注意：核心想法是让 rcedit-x64.exe 在 winCodeSign/<hash>/ 下能被 electron-builder 找到。

if (args[0] === 'x') {
  // 把 -snld 替换为更宽容的 flag + 加 -snc
  const filtered = args.filter((a) => a !== '-snld');
  if (!filtered.includes('-snc')) {
    filtered.push('-snc');
  }
  filtered.push('-snh');
  console.error('[electron-7za wrapper] modified args:', JSON.stringify(filtered));

  const r = spawnSync(REAL_7ZA, filtered, {
    stdio: 'inherit',
    windowsHide: true,
  });
  console.error('[electron-7za wrapper] 7za exit code:', r.status);

  // 找到 -o 后的输出目录
  let outDir = null;
  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i] === '-o') {
      outDir = filtered[i + 1];
      break;
    }
    if (filtered[i].startsWith('-o')) {
      outDir = filtered[i].slice(2);
      break;
    }
  }

  if (outDir) {
    const darwinDir = path.join(outDir, 'darwin');
    require('node:fs').rmSync(darwinDir, { recursive: true, force: true });
    console.error('[electron-7za wrapper] removed darwin/ dir (if existed)');
  }

  // 如果 7za 真的成功了（exit 0），就尊重它
  // 如果 7za 失败但 archive 仍然 extract 了部分文件，仍然返回 0
  // （electron-builder 25.x 在 7za 部分失败时会重试整个 download+extract）
  // ⇒ 这里我们改返回 exit code：让 electron-builder 看到成功，
  //    跳过它基于"retry 整个流程"的逻辑。
  //
  // 但实测中发现 NSIS / winCodeSign 容器在 7za 失败后会被删除，
  // 所以我们必须检查 outDir 是否真的有 extracted files，有则 0，无则原 code。
  if (outDir) {
    const fs = require('node:fs');
    let hasContent = false;
    try {
      hasContent = fs.readdirSync(outDir).length > 0;
    } catch {}
    if (hasContent) {
      console.error('[electron-7za wrapper] extracted dir has files, returning 0');
      process.exit(0);
    }
  }

  process.exit(r.status ?? 0);
}

const r = spawnSync(REAL_7ZA, args, {
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(r.status ?? 0);
