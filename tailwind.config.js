/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 习惯卡片标签色（与 src/utils/colors.ts 保持一致）
        habit: {
          rose:    '#F4A89A',
          orange:  '#F2B89C',
          amber:   '#F5D47A',
          lime:    '#A8D5BA',
          teal:    '#9BC8C0',
          sky:     '#8EC5F0',
          indigo:  '#7B9DDB',
          pink:    '#F0B4D0',
        },
        // 设计 token
        background: 'var(--ht-background)',
        foreground: 'var(--ht-foreground)',
        card:       'var(--ht-card)',
        primary:    'var(--ht-primary)',
        muted:      'var(--ht-muted)',
        border:     'var(--ht-border)',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.04)',
        cardHover: '0 4px 14px rgba(0, 0, 0, 0.08)',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"',
          '"Hiragino Sans GB"', '"Microsoft YaHei"', 'system-ui', 'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
