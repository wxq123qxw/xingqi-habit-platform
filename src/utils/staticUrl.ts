/**
 * 静态资源 URL 解析（Module 07 · Electron 兼容）
 *
 * 背景：
 *   - Web 开发：vite dev server 起在 http://localhost:5173，资源用绝对路径 /animations/1.mp4 OK
 *   - Electron 生产：loadFile() 用 file:// 协议，绝对路径 /animations/1.mp4 解析为 file:///animations/...
 *     —— Windows 磁盘根目录没有这个路径 → 404 → 视频不播放 / 音乐不播
 *
 * 解法：
 *   - file:// 协议 → 用相对路径 ./animations/... / ./music/...
 *   - http(s):// 协议 → 用绝对路径 /animations/... / ./... 都行（保持现有 web 行为）
 *
 * 使用：
 *   - Video src / audio src / link href 等静态资源
 *   - Manifest 数据是 hardcoded '/animations/...'，通过本函数转换
 */

export function resolveStaticUrl(path: string): string {
  // file:// 是 Electron loadFile()
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    // 已经是相对路径就直接返回
    if (path.startsWith('./') || path.startsWith('../')) return path;
    // /xxx → ./xxx
    return '.' + path;
  }
  // http(s) 协议：保持原样（vite dev / 部署后都 OK）
  return path;
}