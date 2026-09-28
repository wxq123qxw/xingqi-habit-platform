/**
 * 背景音乐播放器 —— 平台级常驻
 *
 * 需求（用户在 2026-09-26 提出）：
 *   1. 音乐循环播放 public/music/ 文件夹里的所有 MP3
 *   2. 音乐在整个平台播放（Tab 1/2/3/4 切换不影响）
 *
 * 实现要点：
 *   - 模块级单例 Audio 实例（与 React 生命周期解耦）
 *     → Tab 切换、组件卸载/重挂都不会打断播放
 *   - 多文件队列循环：audio.loop = false，自己用 ended 事件切下一首
 *     （audio.loop 只对单文件生效；跨文件循环必须手动维护队列）
 *   - useSyncExternalStore 暴露状态给 UI（按钮订阅 playing）
 *
 * 接口：
 *   - playMusic() / pauseMusic() / toggleMusic()
 *   - getMusicSnapshot() / subscribeMusic()  →  React 订阅
 *   - useMusicState()                         →  React hook
 *   - window.__music.play() / .pause() / .toggle() / .state()  →  调试
 *
 * 音频源：
 *   - 静态资源放 public/music/（Vite 直接拷贝到 dist/music/，URL 是 /music/xxx.mp3）
 *   - 重要：public/ 下的资源不参与 Vite 模块图，import.meta.glob 扫不到
 *     所以这里**硬编码文件列表**（简单可靠）
 *   - 将来加新 MP3：丢进 public/music/，再把文件名追加到 MUSIC_URLS
 */

import { useSyncExternalStore } from 'react';
import { resolveStaticUrl } from '../utils/staticUrl';

// ============================================================
// 音乐文件清单（硬编码 —— public/ 不进模块图，无法静态扫描）
// ============================================================

/**
 * 背景音乐文件 URL 列表，按顺序循环播放。
 *
 * 当前：1 个文件（background_music.mp3，18MB）
 * 加新文件：丢进 public/music/，追加路径到此数组即可。
 */
const MUSIC_URLS: readonly string[] = [
  '/music/background_music.mp3',
];

/** 把硬编码路径转成 Electron file:// / Web http:// 都能用的实际 URL */
function toPlayableUrl(path: string): string {
  return resolveStaticUrl(path);
}

// ============================================================
// 公开类型
// ============================================================

export interface MusicState {
  /** 是否在播放 */
  playing: boolean;
  /** 当前正在播放的文件路径（调试用） */
  currentFile: string | null;
  /** 当前队列索引 */
  queueIndex: number;
  /** 队列总长度 */
  queueLength: number;
}

// ============================================================
// 内部 state（mutable）
// ============================================================

/**
 * 单例 Audio 实例。
 * 注意：不能放进 React 组件里，否则切 Tab 会卸载 → 音频中断。
 */
const audio = new Audio();
audio.preload = 'auto';
audio.volume = 0.6;

/** 当前队列索引（指向 MUSIC_URLS 里的位置） */
let queueIndex = 0;

/** 订阅者集合 */
const listeners = new Set<() => void>();

/** snapshot 缓存（每次变更后重新生成 + freeze） */
let snapshotCache: MusicState = Object.freeze({
  playing: false,
  currentFile: MUSIC_URLS[0] ?? null,
  queueIndex: 0,
  queueLength: MUSIC_URLS.length,
});

// ============================================================
// 内部工具
// ============================================================

function refreshSnapshot(): void {
  snapshotCache = Object.freeze({
    playing: !audio.paused && audio.src !== '',
    currentFile: MUSIC_URLS[queueIndex] ?? null,
    queueIndex,
    queueLength: MUSIC_URLS.length,
  });
  for (const fn of listeners) {
    queueMicrotask(() => {
      try {
        fn();
      } catch (e) {
        console.error('backgroundMusic listener error', e);
      }
    });
  }
}

/**
 * 播放指定索引的文件。返回 play() 的 Promise，方便上层处理 autoplay policy 拒绝。
 */
function playAt(index: number): void {
  if (MUSIC_URLS.length === 0) {
    console.warn('[Music] music/ 文件夹为空，没有可播放的文件');
    return;
  }
  const normalized = ((index % MUSIC_URLS.length) + MUSIC_URLS.length) % MUSIC_URLS.length;
  queueIndex = normalized;
  // Module 07：Electron file:// 协议下用相对路径，否则绝对路径解析失败
  audio.src = toPlayableUrl(MUSIC_URLS[queueIndex]);
  audio.currentTime = 0;
  const p = audio.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      console.warn('[Music] play() rejected at index', queueIndex);
    });
  }
  refreshSnapshot();
}

// ============================================================
// 跨文件循环 —— audio.ended 时切下一首
// ============================================================

audio.addEventListener('ended', () => {
  if (MUSIC_URLS.length <= 1) {
    // 只有 1 个文件时，audio.loop=true 已自动循环；这里再保险一下
    if (!audio.loop) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    return;
  }
  // 多个文件 → 切下一首
  playAt(queueIndex + 1);
});

// 防止切到不存在的 src（比如用户在 console 改了 audio.src）
audio.addEventListener('error', () => {
  console.error('[Music] audio error, src=', audio.src);
  if (MUSIC_URLS.length > 1) {
    playAt(queueIndex + 1);
  }
});

// ============================================================
// 公开 API
// ============================================================

/**
 * 开始播放（如果已经在播，无副作用）。
 * 第一次调用时设 src，调用 audio.play()。
 */
export function playMusic(): void {
  // new Audio() 默认 src 是当前页 URL；如果 src 没设过真正的音乐文件，就调 playAt
  const src = audio.getAttribute('src') ?? audio.src;
  const isUnset = src === '' || src === window.location.href;
  if (isUnset) {
    playAt(queueIndex);
  } else if (audio.paused) {
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => console.warn('[Music] play() rejected'));
    }
    refreshSnapshot();
  }
}

/** 暂停（保留 src 和 currentTime，可由 playMusic 续播） */
export function pauseMusic(): void {
  audio.pause();
  refreshSnapshot();
}

/** 切换播放 / 暂停 —— 按钮用这个。 */
export function toggleMusic(): void {
  if (snapshotCache.playing) {
    pauseMusic();
  } else {
    playMusic();
  }
}

/** 读当前 snapshot（frozen，每次状态变更是新引用）。 */
export function getMusicSnapshot(): MusicState {
  return snapshotCache;
}

/**
 * 订阅 snapshot 变化。
 * 用法：useSyncExternalStore(subscribeMusic, getMusicSnapshot)
 */
export function subscribeMusic(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** React hook：返回当前播放状态。 */
export function useMusicState(): MusicState {
  return useSyncExternalStore(subscribeMusic, getMusicSnapshot);
}

// ============================================================
// Debug（仅开发期）
// ============================================================

if (typeof window !== 'undefined') {
  // 浏览器 console 里跑：
  //   __music.state()       → 当前 {playing, currentFile, queueIndex, queueLength}
  //   __music.play()        → 播放
  //   __music.pause()       → 暂停
  //   __music.toggle()      → 切换
  //   __music.next()        → 切下一首（调试多文件循环用）
  //   __music.queue()       → 队列 URL 数组
  (window as unknown as { __music: unknown }).__music = {
    state: () => snapshotCache,
    play: () => playMusic(),
    pause: () => pauseMusic(),
    toggle: () => toggleMusic(),
    next: () => playAt(queueIndex + 1),
    queue: () => MUSIC_URLS.slice(),
  };
}