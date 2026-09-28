/**
 * 权限开关 Toggle（通知权限）
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │ ⚠️ Web 端临时方案 — 等打包成 App 后此组件会被替换                │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 【当前限制】（浏览器的硬性安全策略）
 *   - 只能"申请"（requestPermission）
 *   - JS 无法撤销、无法强制弹窗再次询问
 *   - 用户一旦拒绝 → 必须去浏览器站点设置里手动改
 *   - 所以现在的 toggle 是「单向申请 + 引导撤销到浏览器设置」的组合
 *
 * 【打包成 App 后】（计划在 07 数据模型 + 打包环节一并处理）
 *   - Electron / Tauri 桌面端：用原生 notification API，开关写本地配置，**JS 真正可双向控制**
 *   - Capacitor / Cordova 移动端：@capacitor/push-notifications，**JS 真正可双向控制**
 *   - 此组件会被替换为调用原生桥接的版本，UI 不变，行为变完整
 *
 * 视觉：iOS 风格 toggle
 *   - granted  → 绿色背景 + thumb 在右
 *   - 非 granted → 灰色背景 + thumb 在左
 *
 * 点击行为：
 *   - 非 granted（含 default / denied） → 调 requestPermission()
 *   - granted                           → 弹引导 modal，提示去浏览器设置撤销
 *
 * @see ../../utils/pushNotification.ts  当前 web 端薄封装
 * @todo 07 数据模型阶段 + 打包选定后 → 换为原生桥接实现
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  getNotificationStatus,
  requestNotificationPermission,
  type NotificationPermissionResult,
} from '../utils/pushNotification';

interface PermissionToggleProps {
  /** 初始状态（可选，默认从浏览器读） */
  initial?: NotificationPermissionResult;
  /** 状态变化时通知父组件 */
  onChange?: (status: NotificationPermissionResult) => void;
  /** 提示回调（成功 / 错误） */
  onFeedback?: (type: 'success' | 'error', msg: string) => void;
}

export function PermissionToggle({
  initial,
  onChange,
  onFeedback,
}: PermissionToggleProps) {
  const [status, setStatus] = useState<NotificationPermissionResult>(
    initial ?? getNotificationStatus()
  );
  const [showGuide, setShowGuide] = useState(false);

  const granted = status === 'granted';
  const unsupported = status === 'unsupported';

  const updateStatus = (next: NotificationPermissionResult) => {
    setStatus(next);
    onChange?.(next);
  };

  const handleClick = async () => {
    if (unsupported) {
      onFeedback?.('error', '当前浏览器不支持通知');
      return;
    }

    if (granted) {
      // 已授权：JS 无法撤销，弹引导
      setShowGuide(true);
      return;
    }

    // 未授权（含 default / denied）：尝试申请
    // 注意：denied 状态下浏览器会直接拒绝（且不再弹授权框）
    const result = await requestNotificationPermission();
    updateStatus(result);

    if (result === 'granted') {
      onFeedback?.('success', '已开启通知');
    } else if (result === 'denied') {
      onFeedback?.(
        'error',
        '通知被拒绝。请去浏览器地址栏锁形图标 → 通知 → 改为"允许"'
      );
    } else {
      onFeedback?.('error', '未获得通知权限');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={unsupported}
        aria-label={granted ? '已授权，点击了解如何撤销' : '点击申请通知权限'}
        aria-pressed={granted}
        className={`relative inline-flex h-7 w-12 rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
          granted ? 'bg-primary' : 'bg-stone-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            granted ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>

      {/* 撤销引导 Modal */}
      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-6 max-w-[340px] w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[17px] font-semibold text-foreground">
                取消通知授权
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-stone-100 active:scale-95 transition-all"
              >
                <X className="w-4 h-4 text-muted" aria-hidden="true" />
              </button>
            </div>

            <p className="text-[14px] text-foreground leading-relaxed mb-3">
              浏览器安全策略要求在<strong>浏览器站点设置</strong>里手动关闭通知权限，页面内无法直接撤销。
            </p>

            <div className="bg-stone-50 rounded-lg p-3 text-[13px] text-muted leading-relaxed mb-4">
              <div className="font-medium text-foreground mb-1.5">操作步骤：</div>
              <ol className="space-y-1 list-decimal list-inside">
                <li>点击地址栏左侧的锁形 / 盾牌图标</li>
                <li>找到"通知"权限</li>
                <li>改为"阻止"或"询问"</li>
              </ol>
              <div className="mt-2 text-[12px]">
                （Chrome / Edge 在锁形图标，Firefox 在盾牌图标，Safari 在"网站设置"里）
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full h-11 bg-primary text-white rounded-xl font-semibold text-[15px] active:scale-[0.98] transition-transform"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}