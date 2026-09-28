/**
 * BootScreen —— 启动层外壳（梦幻紫粉主题,Module 09 美观化）
 *
 * 职责（spec §4.1 + §4.2.4）：
 * - 当队列非空时全屏覆盖主 UI
 * - 内嵌 AnimationQueuePlayer 自动依次播放
 * - 提供两种跳过方式:
 *   - "下一条"按钮:跳过正在播放的当前条,继续下一条
 *   - "×"关闭按钮:跳过所有待播放动画,直接关闭启动层
 *
 * 设计：与主 Tab 1-4 同款梦幻紫粉主题（替代原米色 #F5F0E6）
 * - 整体背景：淡紫 → 淡粉 → 暖黄 180° 渐变
 * - 视频容器：半透明白 + 紫色虚线
 * - 文案容器：梦幻紫粉渐变 + 白字
 * - 底部控制条：白色毛玻璃
 */

import { SkipForward, X } from 'lucide-react';
import { AnimationQueuePlayer } from './AnimationQueuePlayer';

interface BootScreenProps {
  /** 当前队列剩余条数（来自父组件订阅） */
  pendingCount: number;
  /** 跳过当前播放的一条（队列还有下一条） */
  onSkipCurrent: () => void;
  /** 关闭启动层：跳过所有待播放动画 */
  onCloseAll: () => void;
}

export function BootScreen({
  pendingCount,
  onSkipCurrent,
  onCloseAll,
}: BootScreenProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, #c4b5fd 0%, #fbc2eb 45%, #fddb92 100%)',
      }}
      data-testid="boot-screen"
    >
      {/* 视频 + 文案（由 AnimationQueuePlayer 渲染） */}
      <div className="flex-1 relative overflow-hidden">
        <AnimationQueuePlayer />
      </div>

      {/* 底部控制条（毛玻璃 + 跳过 + 关闭） */}
      <div
        className="px-5 py-3 flex items-center justify-between shrink-0"
        style={{
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: '0 -4px 18px rgba(161, 140, 209, 0.18)',
        }}
      >
        <div className="text-[13px] font-medium text-[#4a4458]">
          还剩{' '}
          <span className="font-extrabold text-[16px] gradient-text tabular-nums">
            {pendingCount}
          </span>{' '}
          条提醒动画
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkipCurrent}
            className="h-9 px-4 text-[13px] font-semibold flex items-center gap-1.5 transition-all active:scale-95"
            style={{
              background:
                'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
              color: '#ffffff',
              borderRadius: '999px',
              boxShadow:
                '0 4px 12px rgba(161, 140, 209, 0.4)',
            }}
            aria-label="跳过当前动画，进入下一条"
          >
            <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
            <span>下一条</span>
          </button>

          <button
            type="button"
            onClick={onCloseAll}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-95"
            style={{
              background: 'rgba(255, 255, 255, 0.85)',
              color: '#4a4458',
              boxShadow: '0 2px 8px rgba(161, 140, 209, 0.18)',
            }}
            aria-label="关闭启动层,跳过所有待播放动画"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}