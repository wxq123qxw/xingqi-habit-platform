/**
 * AnimationQueuePlayer —— 队列自动化播放（米色主题重写版）
 *
 * 布局（参考 index.html 设计）：
 *   - 米色背景整体容器
 *   - 上方 7/4：视频卡片（image-frame 风格 + 虚线边框 + 圆角 + 米色 card）
 *   - 下方：温馨提醒卡片（text-bar 风格 + bg-primary + 圆角 + 阴影）
 *
 * 字体：
 *   - 标题"温馨提醒"用华文新魏（font-stxinwei）
 *   - 文案正文用 PingFang SC / sans
 */

import { useCallback } from 'react';
import { useSyncExternalStore } from 'react';
import { AnimationPlayer } from './AnimationPlayer';
import {
  completeCurrent,
  getAnimationQueueSnapshot,
  subscribeAnimationQueue,
  type QueuedAnimation,
  type QueueState,
} from '../store/animationQueue';
import { useReminderText } from '../hooks/useReminderText';

function getSnapshot(): QueueState {
  return getAnimationQueueSnapshot();
}

export function AnimationQueuePlayer() {
  const state = useSyncExternalStore(subscribeAnimationQueue, getSnapshot);

  const handleVideoComplete = useCallback(() => {
    completeCurrent();
  }, []);

  if (!state.current) return null;

  return (
    <AnimationQueuePlayerInner
      key={state.current.id}
      item={state.current}
      onComplete={handleVideoComplete}
    />
  );
}

// ============================================================
// 内层：渲染视频 + 文案
// ============================================================

interface InnerProps {
  item: QueuedAnimation;
  onComplete: () => void;
}

function AnimationQueuePlayerInner({ item, onComplete }: InnerProps) {
  const style = item.reminderType ?? '抽象搞笑';
  const habitName = item.habitName ?? '';
  const { text, charCount } = useReminderText(style, habitName);

  const isReminderContext = !!item.reminderType && !!item.habitName;

  return (
    <div
      className="h-full w-full flex flex-col gap-4 px-5 py-6"
      style={{ background: 'transparent' }}
    >
      {/* 视频区（image-frame 风格：白色 card + 紫色虚线边框容器 + 圆角 + 柔光） */}
      <section
        className="shrink-0 rounded-[24px] flex items-center justify-center p-5"
        style={{
          height: '62.5vh',
          background: 'rgba(255, 255, 255, 0.78)',
          boxShadow:
            '0 8px 24px rgba(161, 140, 209, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div
          className="w-full h-full rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden"
          style={{ borderColor: 'rgba(161, 140, 209, 0.45)' }}
        >
          <AnimationPlayer
            videoUrl={item.mp4Url}
            onComplete={onComplete}
            className="w-full h-full"
          />
        </div>
      </section>

      {/* 文案区（梦幻紫粉渐变 + 白字 + 华文新魏） */}
      <section
        className="flex-1 min-h-0 rounded-[24px] flex items-center justify-center px-8 py-6 relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
          boxShadow:
            '0 8px 24px rgba(161, 140, 209, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.4)',
        }}
      >
        {/* 高光扫过 */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(120deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 70%)',
            pointerEvents: 'none',
          }}
        />
        {isReminderContext && text ? (
          <p
            className="font-stxinwei text-center max-w-[280px] relative"
            style={{
              color: '#ffffff',
              textShadow:
                '0 2px 8px rgba(74, 68, 88, 0.35), 0 0 2px rgba(255, 255, 255, 0.4)',
              fontSize:
                charCount <= 8
                  ? '32px'
                  : charCount <= 12
                  ? '24px'
                  : '18px',
              lineHeight: 1.4,
              letterSpacing: '0.05em',
            }}
          >
            {text}
          </p>
        ) : (
          <p
            className="font-stxinwei text-[16px] relative"
            style={{ color: '#ffffff', opacity: 0.7 }}
          >
            （非提醒文案场景 — 调试）
          </p>
        )}
      </section>
    </div>
  );
}