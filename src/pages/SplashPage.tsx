/**
 * SplashPage —— 星启页（Nova 紫色星空主题）
 *
 * 视觉：参考用户给的 index.html（深紫星空 + 闪烁星星 + 紫色雾气 + warp 动画）
 * 交互：
 *   - currentUser 存在 → 1.5s 后自动 warp → 跳到主 App（跳过 auth）
 *   - currentUser 不存在 → 等用户点"进入星空" → warp → 跳到 auth 页
 *
 * Module 09 启动流程：
 *   - 软件打开 → SplashPage（无论登录状态）
 *   - 持久登录 → 自动跳 App
 *   - 未登录 → 点按钮跳 AuthPage
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface SplashPageProps {
  /** 当前是否已登录（决定自动 warp vs 按钮 warp） */
  isLoggedIn: boolean;
  /** 用户点"进入星空"后触发（仅未登录时） */
  onEnterApp: () => void;
  /** 自动 warp 完成后触发（仅已登录时） */
  onAutoSkip?: () => void;
}

export function SplashPage({ isLoggedIn, onEnterApp }: SplashPageProps) {
  const [warpActive, setWarpActive] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const starsLayerRef = useRef<HTMLDivElement | null>(null);
  const mistLayerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  /** 已登录 → 1.5s 自动 warp + 自动前进 */
  useEffect(() => {
    if (!isLoggedIn) return;
    const t1 = setTimeout(() => setWarpActive(true), 1500);
    const t2 = setTimeout(() => onEnterApp(), 2500); // 1.5s + 1s warp 动画
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLoggedIn, onEnterApp]);

  /**
   * 视差跟随 + 鼠标光晕（监听 mousemove,不同层不同速度）
   *
   * 分层（视差越深位移越大）：
   *   - 星星层（最快）: dx * -12px, dy * -12px
   *   - 雾气层（中速）: dx * -6px, dy * -6px
   *   - 标题/副标题（最慢）: 微微 scale + 4px 平移
   *   - 鼠标光晕: 跟随鼠标位置（之前已实现）
   *
   * 用 requestAnimationFrame 节流,避免每个 mousemove 都触发 layout。
   */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let mx = 0;
    let my = 0;

    const update = () => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (mx - cx) / cx; // -1 ~ 1
      const dy = (my - cy) / cy;

      if (starsLayerRef.current) {
        starsLayerRef.current.style.transform =
          `translate(${(dx * -12).toFixed(2)}px, ${(dy * -12).toFixed(2)}px) scale(1.02)`;
      }
      if (mistLayerRef.current) {
        mistLayerRef.current.style.transform =
          `translate(${(dx * -6).toFixed(2)}px, ${(dy * -6).toFixed(2)}px)`;
      }
      if (contentRef.current) {
        contentRef.current.style.transform =
          `translate(${(dx * -4).toFixed(2)}px, ${(dy * -4).toFixed(2)}px) scale(${1 + Math.abs(dx + dy) * 0.01})`;
      }
      if (glowRef.current) {
        glowRef.current.style.left = `${mx}px`;
        glowRef.current.style.top = `${my}px`;
      }
      raf = 0;
    };

    const handleMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(update);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /** 点击"进入星空" → warp + 1s 后跳转 */
  const handleEnter = useCallback(() => {
    if (warpActive) return;
    setWarpActive(true);
    setTimeout(() => onEnterApp(), 1000);
  }, [warpActive, onEnterApp]);

  return (
    <main
      ref={stageRef}
      className="relative w-full overflow-hidden flex flex-col items-center justify-center"
      style={{
        minHeight: '100vh',
        paddingTop: 'clamp(0.5rem, 2vw, 1.5rem)',
        paddingBottom: 'clamp(1rem, 4vw, 3rem)',
        paddingLeft: 'clamp(1rem, 4vw, 3rem)',
        paddingRight: 'clamp(1rem, 4vw, 3rem)',
        backgroundColor: '#0d0318',
        color: '#f3e8ff',
        padding: 'clamp(1rem, 4vw, 3rem)',
      }}
    >
      {/* 鼠标跟随光晕 */}
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(168, 85, 247, 0.55) 0%, transparent 70%)',
          pointerEvents: 'none',
          opacity: 0.35,
          transform: 'translate(-50%, -50%)',
          transition: 'opacity 0.4s ease',
          zIndex: 5,
          mixBlendMode: 'screen',
        }}
      />

      {/* 星星 canvas（视差最快层） */}
      <div
        ref={starsLayerRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <StarCanvas count={100} containerRef={starsLayerRef} />
      </div>

      {/* 紫色雾气层（视差中速层） */}
      <div
        ref={mistLayerRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <MistBlob top="-10%" left="-15%" size={60} duration={24} />
        <MistBlob
          bottom="-15%"
          right="-20%"
          size={50}
          duration={30}
          deep
        />
        <MistBlob top="40%" left="50%" size={40} duration={20} />
      </div>

      {/* 主内容：标题 + 副标题（视差最慢层） */}
      <section
        ref={contentRef}
        className="relative flex flex-col items-center justify-center text-center"
        style={{
          zIndex: 10,
          gap: 'clamp(1.25rem, 3vw, 2rem)',
          width: '100%',
          maxWidth: 'min(90vw, 48rem)',
          padding: '1rem',
          transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 5rem)',
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: '#f3e8ff',
            textShadow: '0 0 40px rgba(168, 85, 247, 0.55)',
            margin: 0,
          }}
        >
          星启
        </h1>
        <p
          style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
            color: '#c4b5fd',
            maxWidth: '28rem',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          每一颗习惯，都是点亮自己的星。
        </p>
      </section>

      {/* 底部按钮：仅未登录时显示 */}
      {!isLoggedIn && (
        <section
          style={{
            position: 'absolute',
            bottom: 'clamp(2rem, 8vh, 5rem)',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleEnter}
            aria-label="进入星空,前往登录注册"
            className="inline-flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              padding: '0.875rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: '#ffffff',
              background: '#a855f7',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: 999,
              cursor: 'pointer',
              boxShadow: '0 0 24px rgba(168, 85, 247, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform =
                'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow =
                '0 0 36px 8px rgba(168, 85, 247, 0.55)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow =
                '0 0 24px rgba(168, 85, 247, 0.4)';
            }}
          >
            <span>进入星空</span>
            <ArrowRight className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </section>
      )}

      {/* warp 过渡动画 */}
      <AnimatePresence>
        {warpActive && <WarpTransition />}
      </AnimatePresence>
    </main>
  );
}

/* ============================================================
 * 星星 canvas（闪烁动画）
 *
 * 不返回 wrapper div —— 由调用方提供容器（便于视差层包装）
 * 通过注入容器 ref 接收
 * ========================================================== */
function StarCanvas({
  count,
  containerRef,
}: {
  count: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const canvas = containerRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const finalFragment = document.createDocumentFragment();
    const actualCount = Math.min(
      140,
      Math.max(70, Math.floor(window.innerWidth / 10)),
    );
    const realCount = Math.min(actualCount, count);

    for (let i = 0; i < realCount; i++) {
      const star = document.createElement('span');
      const size = Math.random() * 2 + 1;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.opacity = `${Math.random() * 0.6 + 0.2}`;
      star.style.position = 'absolute';
      star.style.borderRadius = '50%';
      star.style.background = '#ffffff';
      star.style.boxShadow = '0 0 4px rgba(255, 255, 255, 0.45)';
      star.style.setProperty(
        '--star-min-opacity',
        (Math.random() * 0.4 + 0.1).toFixed(2),
      );
      star.style.setProperty(
        '--twinkle-duration',
        `${(Math.random() * 3 + 2).toFixed(2)}s`,
      );
      star.style.animationName = 'twinkle';
      star.style.animationTimingFunction = 'ease-in-out';
      star.style.animationIterationCount = 'infinite';
      star.style.animationDirection = 'alternate';
      star.style.animationDuration =
        `${(Math.random() * 3 + 2).toFixed(2)}s`;
      star.style.animationDelay = `${(Math.random() * 5).toFixed(2)}s`;
      finalFragment.appendChild(star);
    }
    canvas.appendChild(finalFragment);

    return () => {
      // 清空（防止 StrictMode 双调用残留）
      while (canvas.firstChild) {
        canvas.removeChild(canvas.firstChild);
      }
    };
  }, [count, containerRef]);

  // 全局 twinkle 动画（mounted 一次）
  useEffect(() => {
    if (document.getElementById('splash-twinkle-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'splash-twinkle-keyframes';
    style.textContent = `
      @keyframes twinkle {
        0% { opacity: var(--star-min-opacity, 0.3); transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1.1); }
      }
      @keyframes mistDrift {
        0% { transform: translateX(-10%) translateY(0) scale(1); }
        50% { transform: translateX(10%) translateY(-3%) scale(1.05); }
        100% { transform: translateX(-10%) translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return null;
}

/* ============================================================
 * 紫色雾气团（drift 动画）
 * ========================================================== */
function MistBlob({
  top,
  bottom,
  left,
  right,
  size,
  duration,
  deep,
}: {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  size: number; // vw
  duration: number; // s
  deep?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: `${size}vw`,
        height: `${size}vw`,
        top,
        bottom,
        left,
        right,
        borderRadius: '50%',
        background: deep
          ? 'radial-gradient(circle, rgba(88, 28, 135, 0.35) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(192, 132, 252, 0.22) 0%, transparent 70%)',
        animationName: 'mistDrift',
        animationDuration: `${duration}s`,
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      }}
    />
  );
}

/* ============================================================
 * warp 过渡动画（白色核心扩散）
 * ========================================================== */
function WarpTransition() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        background: '#0d0318',
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: '300vmax', height: '300vmax', opacity: 1 }}
        transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
        style={{
          borderRadius: '50%',
          background:
            'radial-gradient(circle, #ffffff 0%, #a855f7 45%, transparent 72%)',
          boxShadow: '0 0 60px 20px rgba(168, 85, 247, 0.55)',
        }}
      />
    </motion.div>
  );
}