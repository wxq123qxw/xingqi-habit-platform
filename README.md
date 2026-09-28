# 星启 · 习惯平台

> **Electron 桌面应用 · 习惯打卡 + 努力值排行榜 + 好友系统**

![星启图标](public/icon-assets/icon-256.png)

一款简洁优雅的习惯打卡桌面应用，基于 **Electron + React 19 + TypeScript + Tailwind CSS**。
帮你养成好习惯，跟朋友比拼坚持天数，看排行榜一目了然。

---

## ✨ 主要功能

- 📝 **习惯管理** —— 创建 / 编辑 / 删除习惯（6 字段：名称、天数、颜色、难度、提醒类型、提醒时间）
- ✅ **每日打卡** —— 圆角渐变按钮 + 视觉反馈
- 📊 **个人统计** —— 总努力值 + 完成数 + 进行中数
- 👥 **好友 + 排行榜** —— 加好友、查看朋友排行（单机版数据本地，多用户需部署公网后端）
- ⏰ **习惯提醒** —— 本地通知 + 启动时补弹提醒
- 🖥️ **桌面特性**：
  - 系统托盘 + 后台运行（点 X 不退出）
  - 窗口贴边自动隐藏（左 / 右）
  - 自定义紫色渐变标题栏
- 🎨 **精美 UI** —— 毛玻璃 + 圆角 + 弹性动画，整体紫色主题

---

## 🖼️ 截图

主界面：
- **Tab 1 习惯列表** —— 卡片式展示，支持展开详情
- **Tab 2 习惯创建** —— 6 字段表单 + 实时预览
- **Tab 3 统计中心** —— 完成数 / 努力值 / 排名
- **Tab 4 个人中心** —— 登录 / 注册 / 设置 / 好友

---

## 🚀 快速开始

### 环境要求

- **Node.js** 18+ (推荐 22 LTS)
- **npm** 9+
- **Windows 10 / 11** x64

### 安装依赖

```bash
npm install
```

### 开发模式（带 Electron）

```bash
npm run electron:dev
```

启动后：
- Vite dev server 在 `http://localhost:5173`
- Electron 窗口自动打开（devtools 自动开）
- 修改代码自动热更新

### 仅前端开发

```bash
npm run dev
```

### 构建生产版本

```bash
# 前端构建
npm run build

# 打包 NSIS 安装包 + 便携版（一次性）
npm run electron:build:nsis       # 仅 NSIS 安装包
npm run electron:build:portable   # 仅便携版
```

产物输出到 `release/nsis3/`：
- `星启-0.0.0-x64.exe` （NSIS 安装包）
- `星启-0.0.0-portable.exe` （便携版）

---

## 📁 项目结构

```
habit-platform/
├── src/                    # 前端 React 源码
│   ├── App.tsx            # 主组件（4 个 Tab）
│   ├── components/        # UI 组件（HabitCard、ConfirmDialog 等）
│   ├── pages/             # 页面（SplashPage、AuthPage）
│   ├── store/             # 状态管理（authStore、habitStore 等）
│   ├── api/               # 后端 API client
│   └── utils/             # 工具函数
│
├── electron/              # Electron 主进程
│   ├── main.cjs           # 主进程（窗口控制、托盘、贴边隐藏、自绘通知）
│   ├── preload.cjs        # contextBridge（前端 ↔ 主进程）
│   ├── icon.ico           # 应用图标（multi-size）
│   └── icon.png           # 备用图标
│
├── backend/               # Node 后端（可选，跨用户功能用）
│   └── src/
│       ├── server.cjs     # Express 入口
│       ├── db.cjs          # SQLite schema
│       ├── crypto.cjs       # PBKDF2 + HMAC token 签名
│       ├── backup.cjs      # AES 加密备份
│       ├── ratelimit.cjs   # 60 req/min 限流
│       └── routes/         # auth / habits / friends / leaderboard
│
├── public/                # 静态资源
│   ├── icon-assets/       # 多尺寸图标
│   ├── favicon.ico        # 浏览器 favicon
│   └── apple-touch-icon.png
│
├── docs/                  # 文档
│   └── RELEASE.md         # 给最终用户的上手指南
│
├── release/               # 打包产物（不传到 git）
├── tmp-icon/              # 临时调试图标（不传到 git）
├── .cache/                # electron-builder 缓存（不传到 git）
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
└── .gitignore
```

---

## 🔧 技术栈

| 类别 | 技术 |
|---|---|
| **桌面壳** | Electron 32 |
| **前端框架** | React 19 + TypeScript |
| **构建工具** | Vite 8 |
| **样式** | Tailwind CSS v3 |
| **动画** | Framer Motion |
| **图标** | Lucide React |
| **日期** | Day.js |
| **后端（可选）** | Node.js + Express + node:sqlite |
| **加密** | PBKDF2-HMAC-SHA256 + HMAC token 签名 + AES-256-GCM 备份 |
| **打包** | electron-builder（NSIS / Portable）|

---

## 🔐 数据与隐私

- **默认模式**：单机版，所有数据存**浏览器 localStorage**，不上传
- **跨用户模式**：可选部署 `backend/` 后端，支持好友 + 排行榜
  - 密码 PBKDF2 哈希（不可逆）
  - Token HMAC-SHA256 签名（30 天 TTL）
  - 自动加密备份（`.hbf`）每 6 小时
- **后端配置文件 `backend/data/`** 包含数据库 + 备份，**不会上传到 GitHub**（`.gitignore` 已排除）

---

## 🛠️ 调试技巧

### 测试习惯通知（无需真实触发时间）

```powershell
# 设置环境变量,启动 dev 模式后会自动弹测试通知
$env:HABIT_NOTIFY_TEST = "1"
npm run electron:dev
```

3 秒后弹第一条，再 2.5 秒后弹第二条（堆叠效果测试）。

### 改时间测试跨日行为

1. Windows 设置 → 时间和语言 → 日期和时间 → 关闭自动设置
2. 改日期到下一天 → App 内 `todayStr()` 会用新日期

---

## 📝 文档

- 📘 **用户上手指南**：[docs/RELEASE.md](docs/RELEASE.md)
- 🎨 **设计文档**：`设计方案/` 目录（项目外，00-09 系列）
- 🔧 **API 文档**：见 `backend/src/routes/` 注释

---

## 📜 License

MIT License

---

## 🤝 贡献

欢迎 PR / Issue！

注意：
- 改动后跑 `npm run typecheck` 确保 TS 通过
- 跑 `npm run lint` 确保 ESLint 通过
- Electron 相关改动需要在 Windows 上跑 `npm run electron:dev` 验证

---

## 📮 反馈

有问题或建议？在 GitHub 上开 Issue。

---

© 2026 海睿团队 · 「星启」作品