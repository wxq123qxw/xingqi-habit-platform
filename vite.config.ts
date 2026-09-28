import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Module 07：Electron 打包需要相对路径
  //   默认 base: '/' → <script src="/assets/xxx.js">
  //   Electron 用 loadFile() 走 file:// 协议，"/assets/..." 解析为 "file:///assets/..."（根目录），
  //   在 Windows 上根本不存在这个路径，导致白屏（只有 backgroundColor，无 React 内容）。
  // 改为相对路径 './' → <script src="./assets/xxx.js"> → file:// 协议下能找到
  //   web dev (http://localhost:5173) 也兼容，相对路径在 http 下也正常工作
  base: './',
})