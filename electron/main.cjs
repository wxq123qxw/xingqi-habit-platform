/**
 * Electron 主进程（Module 09 · Electron 桌面壳 · Windows only）
 *
 * 职责：
 *   - 创建 BrowserWindow，加载前端页面
 *   - 开发模式：等 vite dev server ready 后加载 http://localhost:5173
 *   - 生产模式：加载 dist/index.html（vite build 产物，在 asar 内）
 *   - 单实例锁（避免多次启动同一个 app）
 *   - 自定义 IPC：窗口最大化 / 最小化 / 关闭（让 React 自绘 title bar）
 *   - 隐藏 OS 菜单栏 + 自定义 frame（紫色渐变 title bar）
 *   - 系统托盘 + 关闭按钮 = 最小化到托盘（保持后台运行）
 *   - 窗口贴边自动隐藏（QQ / Windows 11 风格）
 *
 * 设计：
 *   - contextIsolation: true + nodeIntegration: false + sandbox: true
 *     （前端还是纯 web 代码，不能直接访问 Node）
 *   - preload.cjs 暴露一个 habitPlatform API 给前端
 *   - 默认 close 行为：hide 到托盘而非退出
 *     （退出只能从托盘菜单"退出星启"或 IPC `app:quit`）
 *   - 产品名 = "星启"
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, Notification, shell, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ============================================================
// Chromium 命令行开关（必须在 app.whenReady 之前调用）
// ============================================================

// 允许自动播放媒体（无需用户先交互），否则音乐按钮第一次点击可能仍被 autoplay policy 拒绝
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// 禁用拼写检查（避免某些 Chromium 版本在 input 上卡顿）
app.commandLine.appendSwitch('disable-features', 'SpellCheckerEnabled');

// 禁用后台节流（Electron 后台时 input focus 行为可能异常）
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Module 09（2026-09-26）·dev 模式 GPU/network service 兼容性：
// 某些 Windows 显卡驱动 + Vite dev server 偶发 GPU/network service crash,
// 表现 "Network service crashed, restarting service" + ERR_FAILED 加载 URL
// 关闭 GPU 进程隔离 + 关掉可能会引起 crash 的 features
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch(
  'disable-features',
  'CalculateNativeWinOcclusion,UseEcoQoSForBackgroundProcess,NetworkServiceInProcess'
);

// Module 07：禁用硬件加速（某些 Windows 显卡驱动会让 webContents.focus 失效）
app.disableHardwareAcceleration();

// ============================================================
// 启动错误日志（写到 userData 的 startup.log，方便排查崩溃）
// ============================================================
function getLogPath() {
  try {
    return path.join(app.getPath('userData'), 'startup.log');
  } catch {
    return path.join(os.tmpdir(), 'habit-platform-electron-startup.log');
  }
}
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(getLogPath(), line); } catch { /* ignore */ }
  console.log(...args);
}
process.on('uncaughtException', (err) => {
  log('[FATAL uncaughtException]', err.stack || err.message);
});
process.on('unhandledRejection', (reason) => {
  log('[FATAL unhandledRejection]', String(reason));
});
log('[startup] main.cjs loaded, electron version:', process.versions.electron);

// ============================================================
// 配置
// ============================================================

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:5173';

/**
 * 应用图标（Windows 任务栏 + 安装包 + 安装目录）
 *
 * Module 09：用了用户上传的"外星团子习惯打卡图标"。
 * - dev 模式：使用 electron/icon.ico（运行时动态加载）
 * - 打包模式：electron-builder 从这里取（build.win.icon → 此处）
 */
const ICON_ICO = path.join(__dirname, 'icon.ico');
const ICON_PNG = path.join(__dirname, 'icon.png');

function applyAppIcon() {
  try {
    if (fs.existsSync(ICON_ICO)) {
      const img = nativeImage.createFromPath(ICON_ICO);
      if (!img.isEmpty()) {
        app.setAppUserModelId('com.habitplatform.app');
        log('[startup] app icon loaded, size=', img.getSize());
      }
    } else {
      log('[startup] WARN no icon.ico at', ICON_ICO);
    }
  } catch (e) {
    log('[startup] icon load failed:', e.message);
  }
}

// 主窗口初始尺寸（按 375×812 mobile-first 设计，桌面给 ~390×844）
const WINDOW_WIDTH = 390;
const WINDOW_HEIGHT = 844;
const MIN_WIDTH = 350;
const MIN_HEIGHT = 600;

// ============================================================
// 单实例锁（防止多个窗口）
// ============================================================

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  // Module 09（2026-09-26）·用户反馈:再次启动 exe 时后台实例不显示
  // 原因:窗口被 close 按钮 hide 到托盘,second-instance 触发时 win.focus() 无效
  // 修复:先 restore + show,再 focus
  const all = BrowserWindow.getAllWindows();
  if (all.length > 0) {
    const win = all[0];
    if (!win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      log('[lifecycle] second-instance → re-show main window');
    }
  }
});

// ============================================================
// 主窗口创建
// ============================================================

/** 主窗口引用 */
let mainWindow = null;

async function waitForVite(url, maxRetries = 60, delayMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {
      // 还没起来，继续等
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * 安全加载本地文件（捕获所有异常，避免 renderer 启动失败让 main process 崩溃）
 */
async function safeLoad(filePath) {
  try {
    await mainWindow.loadFile(filePath);
    return true;
  } catch (e) {
    log('[startup] safeLoad FAILED:', e.message, 'file=', filePath);
    return false;
  }
}

/**
 * 安全加载 URL（捕获 network service crash 等异常,允许上层重试或 fallback）
 */
async function safeLoadURL(url) {
  try {
    await mainWindow.loadURL(url);
    return true;
  } catch (e) {
    log('[startup] safeLoadURL FAILED:', e.message, 'url=', url);
    return false;
  }
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: '星启',
    // Module 09 (2026-09-26): 启动页背景 — React SplashPage 是深紫星空
    backgroundColor: '#0d0318',
    show: false,
    // Module 09 (2026-09-26): 去掉 OS 默认 chrome + 菜单栏,React 自绘紫色 title bar
    frame: false,
    titleBarStyle: 'hidden',
    icon: fs.existsSync(ICON_ICO)
      ? ICON_ICO
      : fs.existsSync(ICON_PNG)
      ? ICON_PNG
      : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Module 09 (2026-09-26): 显式 setTitle (避免 Windows 任务栏会用 title 而非 productName)
  mainWindow.setTitle('星启');

  // 修复输入框焦点问题
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.webContents.focus();
    // Module 09（2026-09-26）·dev 模式自动打开 DevTools
    // 原因:之前 F12 在 frame:false 下偶发不响应,用户看不到 console.log
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
      log('[startup] dev mode: DevTools opened (detached)');
    }
  });

  // 页面加载完后用 executeJavaScript 强制聚焦 body
  mainWindow.webContents.on('did-finish-load', () => {
    log('[startup] did-finish-load, forcing body focus');
    mainWindow?.webContents
      .executeJavaScript(
        'document.body && document.body.focus && document.body.focus();',
      )
      .catch((e) => log('[startup] focus JS error:', e.message));
  });

  // Module 09：监听加载失败
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`[startup] did-fail-load: code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) log(`[renderer console] (lvl=${level}) ${source}:${line} ${message}`);
  });

  // 加载页面
  if (isDev) {
    console.log('[electron] dev mode: waiting for vite...');
    const ready = await waitForVite(DEV_URL);
    if (!ready) {
      console.error(`[electron] vite did not become ready in 30s (${DEV_URL})`);
      console.log('[electron] fallback to local index.html');
      await safeLoad(path.join(__dirname, '..', 'dist', 'index.html'));
    } else {
      console.log('[electron] vite ready, loading', DEV_URL);
      // 重试 3 次:network service crash 后会自动重启,等待下一次机会
      let loaded = false;
      for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
        loaded = await safeLoadURL(DEV_URL);
        if (!loaded && attempt < 3) {
          console.log(`[electron] loadURL attempt ${attempt} failed, retrying in 1s...`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!loaded) {
        console.log('[electron] all URL attempts failed, fallback to local index.html');
        await safeLoad(path.join(__dirname, '..', 'dist', 'index.html'));
      }
    }
  } else {
    // 生产模式：asar 内 dist/index.html
    // __dirname = <asar>/electron → ../dist/index.html = <asar>/dist/index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('[electron] production mode: loading', indexPath);
    log('[electron] production mode: loading', indexPath);
    await safeLoad(indexPath);
  }

  // 外部链接用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Module 09（2026-09-26）：窗口贴边自动隐藏触发器
  mainWindow.on('move', checkEdgeProximity);
  mainWindow.on('resize', () => {
    // resize 时取消所有待触发的隐藏 / 预览,并恢复不透明
    cancelAutoHidePending();
    if (mainWindow && !mainWindow.isDestroyed() && !isAutoHidden) {
      animateOpacityTo(AUTO_HIDE_OPACITY_FULL);
    }
  });
  // 用户主动拉窗口到中间 → 取消未触发的 hide / preview timer + 恢复 opacity
  mainWindow.on('focus', () => {
    cancelAutoHidePending();
    if (mainWindow && !mainWindow.isDestroyed() && !isAutoHidden) {
      animateOpacityTo(AUTO_HIDE_OPACITY_FULL);
    }
  });
  // 用户最大化 / 还原时,清掉 hide state（避免跟 OS 最大化混合）
  mainWindow.on('maximize', () => {
    cancelAutoHidePending();
    isAutoHidden = false;
    restoreBounds = null;
    stopRestorePolling();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(AUTO_HIDE_OPACITY_FULL);
    }
  });
  mainWindow.on('unmaximize', () => {
    checkEdgeProximity();
  });
  // 拦截 close：默认 hide 到托盘（isQuiting=true 才真正退出）
  mainWindow.on('close', (e) => {
    if (!isQuiting && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault();
      log('[window] close → hide to tray (isQuiting=false)');
      hideMainWindowToTray();
    }
  });
  // App 退出时清掉 polling
  app.on('before-quit', () => {
    stopRestorePolling();
    cancelAutoHidePending();
  });
}

// ============================================================
// IPC：窗口控制（让 React 紫色 title bar 能调最小/最大/关闭）
// ============================================================

/**
 * Module 09（2026-09-26 → 2026-09-26 改进）: 窗口贴边自动隐藏 + 鼠标靠近自动恢复
 *
 * 设计改进版（用户反馈"质感不够、难以察觉"）：
 *   1. 贴边 350ms 后 opacity 1.0→0.78（**预览**）→ 用户能看到窗口在"渐弱"
 *   2. 贴边 800ms 后执行完整隐藏动画：滑出 + opacity 0.78→0.55
 *   3. 隐藏后保持 opacity=0.55 + 6px sliver → 半透明小条仍可见
 *   4. 鼠标靠近 32px → 自动恢复完整位置 + opacity→1.0
 *   5. 首次成功隐藏后，tray 弹气球提示"鼠标靠近即可恢复"
 *
 * 设计：
 *   - 窗口贴到屏幕**左边或右边**且 0.8 秒不动 → 触发预览，350ms 后再开始隐藏
 *     （顶部 / 左上角 / 右上角 不再触发 —— 简化规则）
 *   - 窗口最大化时禁用（避免逻辑冲突）
 *   - 用 setBounds + setOpacity 缓动动画（280ms easeOutCubic）
 *
 * 用途：减少桌面占用、类似 Windows 11 / QQ 靠边隐藏
 */
const AUTO_HIDE_DELAY_MS = 800;           // 贴边 0.8s 后开始隐藏（短一些，不会"忘了窗口在边"）
const AUTO_HIDE_EDGE_THRESHOLD = 10;      // 窗口离屏幕边 ≤ 10px 时触发
const AUTO_HIDE_SLIVER_PX = 6;            // 隐藏后保留 6px 露出（半透明可见）
const AUTO_HIDE_RESTORE_NEAR = 32;        // 鼠标进入 sliver 32px 内恢复（容错更宽）
const AUTO_HIDE_ANIM_MS = 280;            // 滑出动画时长（280ms 更柔）
const AUTO_HIDE_PREVIEW_DELAY = 350;      // 触发后 350ms 先做 opacity 预览
const AUTO_HIDE_OPACITY_FULL = 1.0;
const AUTO_HIDE_OPACITY_PREVIEW = 0.78;   // 预览态：让用户看到"在变"
const AUTO_HIDE_OPACITY_HIDDEN = 0.55;    // 隐藏后保持半透明，sliver 仍"发亮"
const AUTO_HIDE_OPACITY_ANIM_MS = 220;    // opacity 独立动画时长（位置动画 280ms，opacity 220ms）
let autoHideTimer = null;
let autoHidePreviewTimer = null;
let isAutoHidden = false;
let restoreBounds = null;
let restorePollHandle = null;
let inAutoHideAnimation = false;           // 修复抖动 bug:动画期间忽略 move 事件
let inAutoHideAnimationTimeout = null;     // 兜底:动画被中断时强制清 flag

function getWorkArea() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  return display.workArea;
}

function animateWindowTo(target, opacityTarget = null, onDone = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const start = mainWindow.getBounds();
  const opacityStart = mainWindow.getOpacity();
  const opacityEnd = opacityTarget !== null ? opacityTarget : opacityStart;
  const t0 = Date.now();
  const step = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const elapsed = Date.now() - t0;
    const t = Math.min(elapsed / AUTO_HIDE_ANIM_MS, 1);
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    mainWindow.setBounds({
      x: Math.round(start.x + (target.x - start.x) * ease),
      y: Math.round(start.y + (target.y - start.y) * ease),
      width: start.width,
      height: start.height,
    });
    mainWindow.setOpacity(opacityStart + (opacityEnd - opacityStart) * ease);
    if (t < 1) {
      setTimeout(step, 16);
    } else if (onDone) {
      onDone();
    }
  };
  step();
}

/**
 * 单独动画 opacity 到目标值（用于"用户中途取消预览→恢复不透明"）
 */
function animateOpacityTo(targetOpacity) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const startOpacity = mainWindow.getOpacity();
  if (Math.abs(startOpacity - targetOpacity) < 0.005) {
    mainWindow.setOpacity(targetOpacity);
    return;
  }
  const t0 = Date.now();
  const step = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const elapsed = Date.now() - t0;
    const t = Math.min(elapsed / AUTO_HIDE_OPACITY_ANIM_MS, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    mainWindow.setOpacity(startOpacity + (targetOpacity - startOpacity) * ease);
    if (t < 1) setTimeout(step, 16);
  };
  step();
}

/**
 * 立即清掉所有待触发的隐藏 / 预览定时器
 * （resize / focus / unmaximize / hide-to-tray 时调用）
 */
function cancelAutoHidePending() {
  if (autoHidePreviewTimer) {
    clearTimeout(autoHidePreviewTimer);
    autoHidePreviewTimer = null;
  }
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
  // 不清 inAutoHideAnimation / animationTimeout:那是 setBounds 动画的锁,不影响用户主动操作
}

function performAutoHide() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) return;
  if (isAutoHidden) return;

  const workArea = getWorkArea();
  if (!workArea) return;
  const bounds = mainWindow.getBounds();

  // Decide which edge (left / right only — 顶部/左上/右上 已禁用)
  const atLeft =
    bounds.x <= workArea.x + AUTO_HIDE_EDGE_THRESHOLD;
  const atRight =
    bounds.x + bounds.width >= workArea.x + workArea.width - AUTO_HIDE_EDGE_THRESHOLD;

  if (!atLeft && !atRight) return;

  // 计算目标位置（往屏幕外推，只露出 sliver）
  let targetX = bounds.x;
  let targetY = bounds.y;
  if (atLeft) targetX = workArea.x - bounds.width + AUTO_HIDE_SLIVER_PX;
  else if (atRight) targetX = workArea.x + workArea.width - AUTO_HIDE_SLIVER_PX;
  // 注:不再向顶部滑出 (顶部方向已禁用)

  restoreBounds = { x: bounds.x, y: bounds.y };
  isAutoHidden = true;
  // 锁定 checkEdgeProximity,避免动画过程的 move 事件误触发新 timer
  inAutoHideAnimation = true;
  if (inAutoHideAnimationTimeout) clearTimeout(inAutoHideAnimationTimeout);
  // 兜底:动画时长 + 200ms 后强制清,防止动画被打断时 flag 卡住
  inAutoHideAnimationTimeout = setTimeout(() => {
    inAutoHideAnimation = false;
    inAutoHideAnimationTimeout = null;
  }, AUTO_HIDE_ANIM_MS + 200);
  animateWindowTo({ x: targetX, y: targetY }, AUTO_HIDE_OPACITY_HIDDEN, () => {
    // 动画自然完成时清 flag
    if (inAutoHideAnimationTimeout) {
      clearTimeout(inAutoHideAnimationTimeout);
      inAutoHideAnimationTimeout = null;
    }
    inAutoHideAnimation = false;
  });
  startRestorePolling();

  // Module 09（2026-09-26）·用户反馈:Win11 通知中心不接受,要真正的"贴近托盘的气球"
  // 用 Electron 自绘 BrowserWindow 模拟经典气球外观,Win10/Win11 都能看到
  setTimeout(() => {
    showHideHintTooltip();
  }, 600);
}

/**
 * Module 09（2026-09-26）·自绘贴近托盘的气泡 BrowserWindow
 *
 * 为什么不用 tray.displayBalloon?
 *   - Win10:仍能弹真正的气球
 *   - Win11:全部重定向到通知中心,不再显示真正的气球（用户反馈不接受通知中心）
 *
 * 实现:
 *   - 创建一个 frameless + transparent + alwaysOnTop 的 BrowserWindow
 *   - 内容用 inline HTML/CSS data: URL,无外部资源依赖
 *   - 定位到主显示器右下角（贴近系统托盘）
 *   - 自动 5 秒后关闭（用户点击立即关闭）
 *   - 多个通知相互替换（不堆叠）
 */
function showHideHintTooltip() {
  // 1) 关掉旧的（如果有）
  if (hideHintWindow && !hideHintWindow.isDestroyed()) {
    try { hideHintWindow.close(); } catch {}
    hideHintWindow = null;
  }

  // 2) 定位到主显示器工作区右下角（贴近系统托盘）
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;          // 去掉任务栏后的可用区域
  const W = 320;
  const H = 110;
  const margin = 16;
  const x = wa.x + wa.width - W - margin;
  const y = wa.y + wa.height - H - margin;

  // 3) 创建 BrowserWindow
  try {
    hideHintWindow = new BrowserWindow({
      width: W,
      height: H,
      x, y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: false,
        backgroundThrottling: false,
      },
    });

    // 4) 加载 inline HTML（紫色渐变 + 标题 + 内容 + 关闭按钮）
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;font-family:"Microsoft YaHei","Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;overflow:hidden}
.tip{width:320px;height:110px;padding:14px 18px;box-sizing:border-box;background:linear-gradient(135deg,#a18cd1 0%,#fbc2eb 100%);color:#fff;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.35),0 0 0 1px rgba(255,255,255,0.15) inset;position:relative;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between}
.title{font-size:14px;font-weight:700;letter-spacing:.5px;padding-right:24px;text-shadow:0 1px 2px rgba(0,0,0,0.18)}
.content{font-size:12px;opacity:.95;line-height:1.5}
.close{position:absolute;top:8px;right:12px;width:22px;height:22px;line-height:18px;text-align:center;font-size:18px;cursor:pointer;opacity:.75;border-radius:4px}
.close:hover{opacity:1;background:rgba(255,255,255,0.2)}
</style></head>
<body>
<div class="tip" id="tip">
  <span class="close" id="close">×</span>
  <div class="title">✨ 星启 · 窗口已隐藏</div>
  <div class="content">把鼠标靠近屏幕左/右边缘的紫色小条，窗口就会自动滑回来</div>
</div>
<script>
  const close = () => window.close();
  document.getElementById('close').onclick = (e) => { e.stopPropagation(); close(); };
  document.getElementById('tip').onclick = close;
</script>
</body></html>`;

    hideHintWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    hideHintWindow.once('ready-to-show', () => {
      hideHintWindow?.show();
      log('[autohide] custom tooltip balloon shown');
    });

    // 5) 5 秒后自动消失
    setTimeout(() => {
      if (hideHintWindow && !hideHintWindow.isDestroyed()) {
        try { hideHintWindow.close(); } catch {}
      }
      if (hideHintWindow) hideHintWindow = null;
    }, 5000);

    hideHintWindow.on('closed', () => {
      if (hideHintWindow && hideHintWindow.isDestroyed()) hideHintWindow = null;
    });
  } catch (e) {
    log('[autohide] custom tooltip failed:', e.message);
  }
}

function performAutoRestore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isAutoHidden || !restoreBounds) return;
  const target = { x: restoreBounds.x, y: restoreBounds.y };
  restoreBounds = null;
  isAutoHidden = false;
  // 窗口恢复了,顺手关掉贴边的气球提示
  if (hideHintWindow && !hideHintWindow.isDestroyed()) {
    try { hideHintWindow.close(); } catch {}
    hideHintWindow = null;
  }
  // 锁定 checkEdgeProximity,避免动画过程中的 move 事件被误判为"贴边"→再次隐藏
  // (修复抖动 bug:动画期间窗口经过屏幕边附近时,不能启动新的 hide timer)
  inAutoHideAnimation = true;
  if (inAutoHideAnimationTimeout) clearTimeout(inAutoHideAnimationTimeout);
  inAutoHideAnimationTimeout = setTimeout(() => {
    inAutoHideAnimation = false;
    inAutoHideAnimationTimeout = null;
  }, AUTO_HIDE_ANIM_MS + 200);
  animateWindowTo(target, AUTO_HIDE_OPACITY_FULL, () => {
    if (inAutoHideAnimationTimeout) {
      clearTimeout(inAutoHideAnimationTimeout);
      inAutoHideAnimationTimeout = null;
    }
    inAutoHideAnimation = false;
  });
  stopRestorePolling();
}

/** 当窗口 hide 状态时，定期 poll 鼠标位置,鼠标靠近 sliver 就 restore
 *
 * 简化版（2026-09-26）：仅支持左/右两边隐藏，因此只检测屏幕左/右两个方向的恢复区。
 */
function startRestorePolling() {
  if (restorePollHandle) return;
  restorePollHandle = setInterval(() => {
    if (!isAutoHidden || !mainWindow || mainWindow.isDestroyed()) {
      stopRestorePolling();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    const workArea = getWorkArea();
    if (!workArea) return;

    const margin = AUTO_HIDE_RESTORE_NEAR;
    const screenLeft = workArea.x;
    const screenRight = workArea.x + workArea.width;

    // 1) 窗口从左边隐藏 → 鼠标靠近屏幕左边 → 恢复
    if (bounds.x < screenLeft && cursor.x <= screenLeft + margin) {
      performAutoRestore();
      return;
    }
    // 2) 窗口从右边隐藏 → 鼠标靠近屏幕右边 → 恢复
    if (bounds.x + bounds.width > screenRight && cursor.x >= screenRight - margin) {
      performAutoRestore();
      return;
    }
    // 兜底:鼠标进入"隐藏前窗口位置" → 也算恢复
    if (restoreBounds) {
      if (
        cursor.x >= restoreBounds.x &&
        cursor.x <= restoreBounds.x + restoreBounds.width &&
        cursor.y >= restoreBounds.y &&
        cursor.y <= restoreBounds.y + restoreBounds.height
      ) {
        performAutoRestore();
        return;
      }
    }
  }, 120);
}

function stopRestorePolling() {
  if (restorePollHandle) {
    clearInterval(restorePollHandle);
    restorePollHandle = null;
  }
}

function checkEdgeProximity() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) return;
  if (isAutoHidden) return;
  // 修复抖动 bug:动画期间忽略 move 事件（避免动画穿过屏幕边时启动新 timer）
  if (inAutoHideAnimation) return;

  const workArea = getWorkArea();
  if (!workArea) return;
  const bounds = mainWindow.getBounds();

  const atLeft =
    bounds.x <= workArea.x + AUTO_HIDE_EDGE_THRESHOLD;
  const atRight =
    bounds.x + bounds.width >= workArea.x + workArea.width - AUTO_HIDE_EDGE_THRESHOLD;
  // Module 09（2026-09-26）·简化:只允许左/右两边触发自动隐藏
  // 顶部 / 左上 / 右上 都不再触发（顶部贴边恢复手感也不够直观）

  if (atLeft || atRight) {
    // 已经在等隐藏 → 不重复启动
    if (autoHideTimer) return;
    // 350ms 后做 opacity 预览（让用户看到"在变"）
    if (!autoHidePreviewTimer) {
      autoHidePreviewTimer = setTimeout(() => {
        autoHidePreviewTimer = null;
        if (mainWindow && !mainWindow.isDestroyed() && !isAutoHidden) {
          animateOpacityTo(AUTO_HIDE_OPACITY_PREVIEW);
        }
      }, AUTO_HIDE_PREVIEW_DELAY);
    }
    // 800ms 后正式隐藏
    autoHideTimer = setTimeout(() => {
      autoHideTimer = null;
      performAutoHide();
    }, AUTO_HIDE_DELAY_MS);
  } else {
    // 拖离边缘 → 取消所有待触发 timer + 恢复 opacity
    cancelAutoHidePending();
    if (mainWindow && !mainWindow.isDestroyed() && !isAutoHidden) {
      animateOpacityTo(AUTO_HIDE_OPACITY_FULL);
    }
    // 如果之前意外 hide 但用户拖回来了，也恢复
    if (isAutoHidden && restoreBounds) {
      performAutoRestore();
    }
  }
}

/**
 * Module 09（2026-09-26）·自绘提醒通知气泡
 *
 * 为什么不用 Notification API / 系统通知中心?
 *   - Win11 把所有 toast 重定向到通知中心,标题变成 com.habitplatform.app
 *   - 跟整体紫色主题不协调(灰底黑字,用户反馈不接受)
 *
 * 实现:
 *   - frameless + transparent + alwaysOnTop 的 BrowserWindow
 *   - 紫色渐变背景 + ✨ 图标 + 标题 + 内容 + × 按钮
 *   - 屏幕右下角,从底部向上垂直堆叠(多条同时存在时)
 *   - 8 秒自动关闭,点击通知或 × 立即关闭
 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function reflowHabitNotifs() {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const W = 360;
  const H = 96;
  const margin = 16;
  const stackOffset = 8;
  let i = 0;
  for (const w of habitNotifStack) {
    if (w.isDestroyed()) continue;
    const x = wa.x + wa.width - W - margin;
    const y = wa.y + wa.height - H - margin - i * (H + stackOffset);
    try {
      w.setBounds({ x, y, width: W, height: H });
    } catch {}
    i++;
  }
}

function showHabitNotification({ title, body }) {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const W = 360;
  const H = 96;
  const margin = 16;
  const x = wa.x + wa.width - W - margin;
  const y = wa.y + wa.height - H - margin;

  try {
    const win = new BrowserWindow({
      width: W, height: H, x, y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: false,
        backgroundThrottling: false,
      },
    });

    habitNotifStack.push(win);

    const safeTitle = escapeHtml(title || '');
    const safeBody = escapeHtml(body || '');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;font-family:"Microsoft YaHei","Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;overflow:hidden}
.toast{width:360px;height:96px;padding:14px 18px;box-sizing:border-box;background:linear-gradient(135deg,#a18cd1 0%,#fbc2eb 100%);color:#fff;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.35),0 0 0 1px rgba(255,255,255,0.18) inset;position:relative;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;animation:slideIn .35s cubic-bezier(.34,1.56,.64,1)}
@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
.title{font-size:13px;font-weight:700;letter-spacing:.3px;padding-right:24px;text-shadow:0 1px 2px rgba(0,0,0,0.18);display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.body{font-size:12px;opacity:.96;line-height:1.45;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.close{position:absolute;top:8px;right:12px;width:22px;height:22px;line-height:18px;text-align:center;font-size:18px;cursor:pointer;opacity:.75;border-radius:4px}
.close:hover{opacity:1;background:rgba(255,255,255,0.22)}
.icon{font-size:13px;flex-shrink:0}
</style></head>
<body>
<div class="toast" id="t">
  <span class="close" id="close">×</span>
  <div class="title"><span class="icon">✨</span><span>${safeTitle}</span></div>
  <div class="body">${safeBody}</div>
</div>
<script>
const closeWin = () => {
  // 通知被点击:先 show 主窗口再关通知
  try {
    if (window.electronAPI && window.electronAPI.show) window.electronAPI.show();
  } catch {}
  window.close();
};
document.getElementById('close').onclick = (e) => { e.stopPropagation(); window.close(); };
document.getElementById('t').onclick = closeWin;
</script>
</body></html>`;

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    win.once('ready-to-show', () => {
      try { win.show(); } catch {}
      log('[notify] habit notification shown: ', safeTitle);
    });

    // 8 秒后自动关闭
    setTimeout(() => {
      if (!win.isDestroyed()) {
        try { win.close(); } catch {}
      }
    }, 8000);

    win.on('closed', () => {
      const idx = habitNotifStack.indexOf(win);
      if (idx >= 0) habitNotifStack.splice(idx, 1);
      reflowHabitNotifs();
    });

    // 重新堆叠
    reflowHabitNotifs();
  } catch (e) {
    log('[notify] showHabitNotification failed:', e.message);
  }
}

/**
 * IPC handlers for window controls
 *  - 'window:minimize'      → minimize window
 *  - 'window:toggle-max'    → maximize / unmaximize toggle
 *  - 'window:close'         → close window (default: hide to tray)
 *  - 'window:is-maximized'  → query current state
 *  - 'window:hide-to-tray'  → hide window to system tray (no-op if already hidden)
 *  - 'app:quit'             → actually quit app (sets isQuiting, then app.quit)
 *  - 'app:show'             → show main window from tray
 */
function registerIpcHandlers() {
  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.handle('window:toggle-max', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return { maximized: false };
      }
      mainWindow.maximize();
      return { maximized: true };
    }
    return { maximized: false };
  });
  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
  ipcMain.handle('window:hide-to-tray', () => {
    hideMainWindowToTray();
  });
  ipcMain.handle('app:show', () => {
    showMainWindow();
  });
  ipcMain.handle('app:quit', () => {
    log('[ipc] app:quit invoked');
    isQuiting = true;
    app.quit();
  });
  ipcMain.handle('window:is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized();
  });

  // Module 09（2026-09-26）·习惯提醒通知:用主进程自绘气泡,绕开 Win11 通知中心
  ipcMain.handle('habit:notify', async (_e, options) => {
    if (!options || typeof options !== 'object') return false;
    showHabitNotification({
      title: String(options.title || '星启'),
      body: String(options.body || ''),
    });
    return true;
  });

  // Forward maximize / unmaximize events to renderer so title bar can update button state
  function emitMaximizeState(maximized) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximize-changed', { maximized });
    }
  }
  mainWindow?.on('maximize', () => emitMaximizeState(true));
  mainWindow?.on('unmaximize', () => emitMaximizeState(false));
}

// ============================================================
// App 生命周期
// ============================================================

/**
 * 是否真正退出（区分"关闭窗口"vs"用户主动退出"）
 * - 默认 false:窗口 close 事件只 hide 到托盘
 * - 只有托盘菜单"退出"或 IPC `app:quit` 才设为 true
 */
let isQuiting = false;

/**
 * 系统托盘（Module 09 后台运行）
 * - 托盘菜单：显示星启 / 退出星启
 * - 单击托盘 = 切换主窗口显示/隐藏
 * - 双击托盘 = 显示主窗口
 * - 主窗口关闭按钮 → hide 到托盘,程序继续在后台运行
 */
let tray = null;
let hideHintWindow = null;                  // 自绘贴近托盘的气泡(Win10/11 通用,绕开通知中心)
const habitNotifStack = [];                 // 当前活跃的提醒通知(垂直堆叠,从屏幕底部向上)

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function hideMainWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // 隐藏前先取消 auto-hide preview + state（避免下次显示时还在 hidden bounds / 半透明）
  cancelAutoHidePending();
  if (isAutoHidden && restoreBounds) {
    mainWindow.setBounds(restoreBounds);
    isAutoHidden = false;
    restoreBounds = null;
    stopRestorePolling();
  }
  // 恢复 opacity = 1,下次 show 出来不会半透明
  try { mainWindow.setOpacity(AUTO_HIDE_OPACITY_FULL); } catch {}
  mainWindow.hide();
}

function createTray() {
  if (tray) return; // 已存在
  // Module 09（2026-09-26）·用户反馈托盘看不到星启:
  // Windows 系统托盘只渲染 16x16 / 32x32,icon.png(512x512)会自动缩放成模糊小点
  // icon.ico 是 multi-size(256/128/64/48/32/16),Tray 加载时会挑最接近的 size,清晰
  const trayIconPath = fs.existsSync(ICON_ICO) ? ICON_ICO : ICON_PNG;
  const trayIcon = nativeImage.createFromPath(trayIconPath);
  if (trayIcon.isEmpty()) {
    log('[tray] WARN tray icon empty at', trayIconPath);
    return;
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('星启 · 习惯平台');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示星启',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: '退出星启',
      click: () => {
        isQuiting = true;
        log('[tray] user chose quit');
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // 单击 = 切换显示
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });
  // 双击 = 显示
  tray.on('double-click', () => showMainWindow());

  log('[tray] tray icon created');
}

app.whenReady().then(async () => {
  log('[startup] app ready, creating main window...');

  // Module 09: 隐藏菜单栏（删除 File Edit View Window Help）
  // ⇒ 否则 Electron 默认会渲染出顶部菜单,与我们 React 自绘的紫色 title bar 冲突
  Menu.setApplicationMenu(null);

  applyAppIcon();
  await createMainWindow();
  registerIpcHandlers();
  createTray();
  log('[startup] main window + tray + IPC handlers registered');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  // Dev-only: 启动后 3 秒自动弹一条测试通知(测试用,不影响生产)
  // 启动方式: $env:HABIT_NOTIFY_TEST = "1"; npm run electron:dev
  if (process.env.HABIT_NOTIFY_TEST === '1') {
    log('[dev] HABIT_NOTIFY_TEST=1 → 3s 后弹测试通知');
    setTimeout(() => {
      showHabitNotification({ title: '晨跑', body: '今天又是摆烂的一天吗' });
      // 再 2.5 秒后弹第二条,测试堆叠效果
      setTimeout(() => {
        showHabitNotification({ title: '读书', body: '坚持就是胜利,继续加油 ✨' });
      }, 2500);
    }, 3000);
  }
});

// 拦截窗口 close：默认行为改为 hide 到托盘
// 已移到 createMainWindow() 内部注册（顶层时 mainWindow 还是 null）
// 下面这段保留为空说明位置

// Windows / Linux: 所有窗口关闭时
// - isQuiting=true → 真正退出
// - isQuiting=false → 保持在后台（tray 图标仍可点"显示星启"恢复窗口）
app.on('window-all-closed', () => {
  if (isQuiting) {
    log('[lifecycle] window-all-closed + isQuiting → app.quit()');
    app.quit();
  } else {
    log('[lifecycle] window-all-closed but keep running in tray');
  }
});

// 退出前清理托盘 + 所有 timer（包含 preview + restore polling）
app.on('before-quit', () => {
  isQuiting = true;
  stopRestorePolling();
  cancelAutoHidePending();
  // 关闭自绘气球窗口
  if (hideHintWindow && !hideHintWindow.isDestroyed()) {
    try { hideHintWindow.close(); } catch {}
    hideHintWindow = null;
  }
  // 关闭所有活跃提醒通知
  for (const w of habitNotifStack.slice()) {
    if (!w.isDestroyed()) {
      try { w.close(); } catch {}
    }
  }
  habitNotifStack.length = 0;
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
