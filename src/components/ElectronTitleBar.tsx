/**
 * ElectronTitleBar.tsx（Module 09 · 2026-09-26）
 *
 * 自定义标题栏（替换 OS 默认 chrome）：
 *   - 仅在 Electron 环境（window.habitPlatform.isElectron === true）渲染
 *   - 鼠标拖拽 -webkit-app-region: drag
 *   - 紫色渐变背景 + 星星 logo + "星启"
 *   - 自定义 SVG 窗口控制（最小化、最大化/还原、关闭到托盘、退出）
 *   - 通过 habitPlatform.windowControls / habitPlatform.app IPC 触发主进程
 *   - 同步 isMaximized 状态（maximize / unmaximize 事件）
 *
 * 后台运行设计（2026-09-26 新增）：
 *   - 默认 X 按钮 = hide 到系统托盘（QQ/Windows 11 风格）
 *   - title bar 提供独立的"退出"按钮（X 旁一个小图标），用户主动结束程序
 *   - 也可以从系统托盘菜单"退出星启"结束程序
 */
import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface ElectronWindowControls {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<{ maximized: boolean }>;
  close: () => Promise<void>;
  hideToTray: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizeChanged: (cb: (payload: { maximized: boolean }) => void) => () => void;
}

interface ElectronApp {
  show: () => Promise<void>;
  quit: () => Promise<void>;
}

declare global {
  interface Window {
    habitPlatform?: {
      platform: string;
      versions: { electron: string; node: string; chrome: string };
      isElectron: boolean;
      windowControls: ElectronWindowControls;
      app: ElectronApp;
    };
  }
}

export function ElectronTitleBar() {
  // 仅当在 Electron 渲染时才有这个组件
  const isElectron = typeof window !== 'undefined' && window.habitPlatform?.isElectron;
  const controls = window.habitPlatform?.windowControls;
  const appApi = window.habitPlatform?.app;

  const [maximized, setMaximized] = useState(false);
  // Module 09（2026-09-26）·美化:用 React ConfirmDialog 替代原生 window.confirm
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  useEffect(() => {
    if (!controls) return;
    // 初始化
    controls.isMaximized().then((v) => setMaximized(!!v));
    // 订阅主进程事件
    const off = controls.onMaximizeChanged((p) => setMaximized(!!p?.maximized));
    return off;
  }, [controls]);

  if (!isElectron || !controls) return null;

  return (
    <div
      className="electron-title-bar"
      style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 14px',
        background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitAppRegion: 'drag',
        // 在 React 层也设 inline-style 保险
        flexShrink: 0,
      } as React.CSSProperties}
    >
      {/* 高光扫过 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(120deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* 左侧：星星 logo + 产品名 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: '1.1rem', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }}>
          ✨
        </span>
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textShadow: '0 2px 4px rgba(0,0,0,0.18)',
          }}
        >
          星启
        </span>
      </div>

      {/* 右侧：自定义窗口控制（不可 drag） */}
      <div
        className="electron-title-bar__controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          position: 'relative',
          zIndex: 1,
          WebkitAppRegion: 'no-drag',
        }}
      >
        <TitleBarButton
          ariaLabel="最小化"
          onClick={() => controls.minimize()}
          colorA="#89f7fe"
          colorB="#66a6ff"
          icon="min"
        />
        <TitleBarButton
          ariaLabel={maximized ? '还原' : '最大化'}
          onClick={async () => {
            const r = await controls.toggleMaximize();
            setMaximized(!!r?.maximized);
          }}
          colorA="#fddb92"
          colorB="#d1fdff"
          icon={maximized ? 'restore' : 'max'}
        />
        {/* 关闭按钮：默认隐藏到托盘（后台运行） */}
        <TitleBarButton
          ariaLabel="关闭到托盘（后台运行）"
          onClick={() => controls.hideToTray()}
          colorA="#ff9a9e"
          colorB="#fecfef"
          icon="close"
        />
        {/* 真正退出按钮（可选） */}
        {appApi && (
          <TitleBarButton
            ariaLabel="退出星启"
            onClick={() => setShowQuitConfirm(true)}
            colorA="#9aa5ff"
            colorB="#6f7eff"
            icon="quit"
          />
        )}
      </div>

      {/* Module 09（2026-09-26）·美化退出确认弹窗（替代原生 confirm） */}
      <ConfirmDialog
        open={showQuitConfirm}
        variant="danger"
        title="确定退出星启？"
        description="点 X 只是隐藏到系统托盘，程序还在后台运行。点退出后所有习惯提醒会暂停。"
        confirmText="退出"
        cancelText="再想想"
        onCancel={() => setShowQuitConfirm(false)}
        onConfirm={() => {
          setShowQuitConfirm(false);
          appApi?.quit();
        }}
      />
    </div>
  );
}

interface TitleBarButtonProps {
  ariaLabel: string;
  onClick: () => void;
  colorA: string;
  colorB: string;
  icon: 'min' | 'max' | 'restore' | 'close' | 'quit';
}

function TitleBarButton({ ariaLabel, onClick, colorA, colorB, icon }: TitleBarButtonProps) {
  const [hover, setHover] = useState(false);
  const size = 28;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        background: hover
          ? `linear-gradient(135deg, ${colorA} 0%, ${colorB} 100%)`
          : 'transparent',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 8,
        transition: 'background 0.16s ease, transform 0.16s cubic-bezier(0.34,1.56,0.64,1)',
        outline: 'none',
        transform: hover ? 'scale(1.10)' : 'scale(1)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id={`g-${colorA}-${colorB}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colorA} />
            <stop offset="100%" stopColor={colorB} />
          </linearGradient>
        </defs>
        {/* 五角星 + icon 标记 */}
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={`url(#g-${colorA}-${colorB})`}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="0.4"
          opacity={hover ? 1 : 0.85}
        />
        {icon === 'min' && (
          <line x1="8" y1="12" x2="16" y2="12" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" />
        )}
        {icon === 'max' && (
          <rect x="8.5" y="8.5" width="7" height="7" rx="1" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" />
        )}
        {icon === 'restore' && (
          <>
            <rect x="6.5" y="9" width="8" height="7" rx="1" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
            <line x1="9" y1="9" x2="9" y2="6.5" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
            <line x1="9" y1="6.5" x2="14.5" y2="6.5" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
            <line x1="14.5" y1="6.5" x2="14.5" y2="9" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
          </>
        )}
        {icon === 'close' && (
          <>
            <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" />
            <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {icon === 'quit' && (
          <>
            <rect x="7" y="5" width="10" height="11" rx="1.4" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
            <path d="M16 10 L19 10 L19 14 L16 14" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
            <line x1="16" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  );
}
