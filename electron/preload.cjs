/**
 * Electron preload script（Module 09 · 自定义 title bar）
 *
 * 通过 contextBridge 把有限的 Node API 暴露给前端：
 * - platform: 当前平台（用于 / 排版 / 字体差异）
 * - versions: Electron / Node / Chrome 版本号
 * - windowControls: React 自绘紫色 title bar 用的 minimize / toggleMaximize / close IPC
 * - app: hideToTray / show / quit（后台运行 + 系统托盘）
 *
 * 注意：
 *   - contextIsolation 必须为 true
 *   - 这里只暴露只读信息 + 受控的窗口控制（不允许任意 IPC）
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('habitPlatform', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  isElectron: true,
  windowControls: {
    /** 最小化窗口 */
    minimize: () => ipcRenderer.invoke('window:minimize'),
    /** 切换最大化 / 还原 */
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-max'),
    /**
     * 关闭窗口
     * 默认行为:hide 到系统托盘（程序继续在后台运行）
     * 想真正退出请用 quitApp()
     */
    close: () => ipcRenderer.invoke('window:close'),
    /** 显式隐藏到托盘（和 close 默认行为相同,语义更清楚） */
    hideToTray: () => ipcRenderer.invoke('window:hide-to-tray'),
    /** 查询当前是否最大化 */
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    /** 监听最大化状态变化（React title bar 同步按钮 UI） */
    onMaximizeChanged: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
    },
  },
  app: {
    /** 从托盘恢复主窗口 */
    show: () => ipcRenderer.invoke('app:show'),
    /** 真正退出应用（清掉托盘 + 销毁所有窗口） */
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  /**
   * Module 09（2026-09-26）·习惯提醒通知(自绘紫色气泡,绕开 Win11 通知中心)
   * - title: 通知标题(习惯名)
   * - body:  通知正文(提醒文案)
   * 注意:放在 habitPlatform 顶层(不是 app 下),pushNotification.ts 直接 window.habitPlatform.notify
   */
  notify: (options) => ipcRenderer.invoke('habit:notify', options),
});
