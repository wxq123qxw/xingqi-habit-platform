/**
 * 浏览器推送通知工具（spec §4.1.1）
 *
 * 使用 Notification API 发送浏览器原生通知：
 * - Chrome/Edge: 支持
 * - Safari: 部分支持（需用户授权）
 * - Firefox: 支持
 *
 * 注意：
 * - 必须先 requestNotificationPermission() 获取用户授权
 * - HTTPS / localhost 才能用（dev server 是 localhost 没问题）
 * - 用户授权拒绝时降级：在页面内显示"提醒卡片"（Phase 4）
 */

export type NotificationPermissionResult =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

/** 当前 Notification 支持情况 + 权限状态 */
export function getNotificationStatus(): NotificationPermissionResult {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission as NotificationPermissionResult;
}

/** 申请浏览器通知权限（用户点击"立即测试"时调用） */
export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result as NotificationPermissionResult;
  } catch {
    return 'denied';
  }
}

export interface PushOptions {
  title: string;
  body: string;
  /** 相同 tag 会替换已有通知（去重） */
  tag?: string;
  /** 通知被点击时的回调（可切换到 Tab 1） */
  onClick?: () => void;
  /** 自动关闭时间（毫秒），默认 8000 = 8 秒 */
  autoCloseMs?: number;
}

/**
 * 发送浏览器通知（如果未授权会降级 → 不弹窗）
 * 返回 boolean 表示是否真的弹出来了
 */
export async function sendBrowserNotification(
  options: PushOptions
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  // Module 09（2026-09-26）·Electron 环境:用主进程的自绘紫色气泡
  // 绕开 Win11 系统通知中心(标题会变成 com.habitplatform.app,跟整体紫色主题不协调)
  const electronApi = (window as unknown as {
    habitPlatform?: { notify?: (opts: { title: string; body: string; tag?: string }) => Promise<boolean> };
  }).habitPlatform;
  if (electronApi?.notify) {
    try {
      await electronApi.notify({
        title: options.title,
        body: options.body,
        tag: options.tag,
      });
      // 自绘气泡会自动 8 秒关闭 + 点击自动关 + 切换到主窗口
      return true;
    } catch (e) {
      console.warn('electron notify failed, fallback to web Notification', e);
    }
  }

  // 普通 web 环境:用浏览器原生 Notification API
  if (!('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notification = new window.Notification(options.title, {
      body: options.body,
      tag: options.tag,
      // requireInteraction: 非标准但部分浏览器支持
      // 不用 @ts-expect-error（之前用但当前 TS 不报错，留空避免 unused directive）
      // @ts-ignore - 非标准但部分浏览器支持
      requireInteraction: false,
    });

    if (options.onClick) {
      notification.onclick = () => {
        options.onClick?.();
        notification.close();
      };
    }

    if (options.autoCloseMs && options.autoCloseMs > 0) {
      setTimeout(() => notification.close(), options.autoCloseMs);
    }

    return true;
  } catch (e) {
    console.warn('sendBrowserNotification failed', e);
    return false;
  }
}