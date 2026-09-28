/**
 * AnimationPlayer - MP4 视频播放组件（Phase 1+）
 *
 * 接口契约：
 *   - videoUrl: MP4 文件路径
 *                 - 本地：'/animations/abstract-funny-0.mp4'（Vite public/ 目录）
 *                 - 远程：'https://cdn.example.com/anim.mp4'
 *
 * 用原生 <video> 元素 + onEnded 回调：
 *   - autoplay: 自动开始（必须在用户首次手势之后；spec 浏览器策略）
 *   - loop: false（视频本身闭环）
 *   - muted: true（Autoplay 必需 muted，否则浏览器静默 block）
 *   - playsInline: true（iOS Safari 必须，否则强制全屏播放）
 *
 * 后续替换动画的入口：
 *   - 修改 src/data/animationManifest.ts 的 mp4Url
 *   - 本组件及下游（队列 / 启动层）无需改动
 *
 * 关于 lottie-react：
 *   - 之前尝试用 Lottie 但 v3 + 程序生成的 Lottie 兼容性差
 *   - 本组件完全用浏览器原生 <video>，不依赖任何第三方动画库
 *   - lottie-react 依赖保留在 package.json 里（卸载需用户执行，避免自动改 deps）
 */

import { useRef, useEffect } from 'react';
import { resolveStaticUrl } from '../utils/staticUrl';

interface AnimationPlayerProps {
  /** MP4 视频 URL（本地路径或远程 URL） */
  videoUrl: string;
  /** 视频自然播放结束时回调 */
  onComplete?: () => void;
  autoplay?: boolean;
  className?: string;
}

export function AnimationPlayer({
  videoUrl,
  onComplete,
  autoplay = true,
  className,
}: AnimationPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Module 07：Electron file:// 协议下，绝对路径 /animations/x.mp4 解析失败
  // resolveStaticUrl 把绝对路径转成相对路径 ./animations/x.mp4
  const resolvedUrl = resolveStaticUrl(videoUrl);

  // videoUrl 变化时重新加载（避免切换不同动画时显示上次的最后一帧）
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.load();
    }
  }, [resolvedUrl]);

  if (!resolvedUrl) {
    return (
      <div className={className}>
        <div className="text-[12px] text-muted p-4 text-center">
          ⚠️ 未配置视频
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={resolvedUrl}
      autoPlay={autoplay}
      loop={false}
      muted
      playsInline
      controls={false}
      onEnded={() => onComplete?.()}
      // 关键：
      //   w-auto h-auto + max-w-full max-h-full → 不强制拉伸，按原始比例缩放
      //   object-contain → 不裁剪，保留完整画面
      //   父级用 flex 居中并设定最大容器尺寸（如 max-w-[400px] max-h-[400px]）
      className={`block max-w-full max-h-full w-auto h-auto object-contain ${className ?? ''}`}
      style={{
        imageRendering: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
      }}
      data-testid="animation-video"
    >
      您的浏览器不支持视频播放。
    </video>
  );
}
