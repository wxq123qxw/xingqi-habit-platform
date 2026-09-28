/**
 * ConfirmDialog —— 自定义确认弹窗（Module 09 美观化）
 *
 * 替代 native confirm() —— 提供梦幻毛玻璃 + 圆角卡片 + 弹性弹入动画
 * 不同 variant 对应不同配色（危险/恢复/解除）
 *
 * 用法：
 *   const [pending, setPending] = useState<Item | null>(null)
 *   ...
 *   <button onClick={() => setPending(item)}>删除</button>
 *   {pending && (
 *     <ConfirmDialog
 *       open={!!pending}
 *       variant="danger"
 *       title="确定要删除吗？"
 *       highlight={pending.name}
 *       onCancel={() => setPending(null)}
 *       onConfirm={() => { doDelete(pending); setPending(null); }}
 *     />
 *   )}
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, RotateCcw, UserMinus, X } from 'lucide-react';
import type { ReactNode } from 'react';

export type ConfirmVariant = 'danger' | 'restore' | 'unfriend' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  variant?: ConfirmVariant;
  title: string;
  highlight?: string;          // 高亮对象名（如 "晨跑"、"小李"）
  description?: string;         // 可选的副文案
  confirmText?: string;         // 默认 "确定"
  cancelText?: string;          // 默认 "取消"
  icon?: ReactNode;             // 自定义图标（不传则用 variant 默认）
  onCancel: () => void;
  onConfirm: () => void;
}

const VARIANT_THEMES: Record<
  ConfirmVariant,
  {
    gradient: string;
    shadow: string;
    /** 高亮对象前显示的名词前缀（如 "习惯"、"好友"） */
    label: string;
    icon: (props: { className?: string }) => ReactNode;
    confirmBg: string;
  }
> = {
  danger: {
    gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    shadow: '0 6px 18px rgba(255, 154, 158, 0.4)',
    label: '习惯',
    icon: (p) => <Trash2 className={p.className ?? 'w-5 h-5'} strokeWidth={2.5} />,
    confirmBg:
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  },
  restore: {
    gradient: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    shadow: '0 6px 18px rgba(132, 250, 176, 0.4)',
    label: '习惯',
    icon: (p) => <RotateCcw className={p.className ?? 'w-5 h-5'} strokeWidth={2.5} />,
    confirmBg:
      'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
  },
  unfriend: {
    gradient: 'linear-gradient(135deg, #fbc2eb 0%, #a18cd1 100%)',
    shadow: '0 6px 18px rgba(251, 194, 235, 0.4)',
    label: '好友',
    icon: (p) => (
      <UserMinus className={p.className ?? 'w-5 h-5'} strokeWidth={2.5} />
    ),
    confirmBg:
      'linear-gradient(135deg, #fbc2eb 0%, #a18cd1 100%)',
  },
  info: {
    gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    shadow: '0 6px 18px rgba(161, 140, 209, 0.4)',
    label: '',
    icon: (p) => <X className={p.className ?? 'w-5 h-5'} strokeWidth={2.5} />,
    confirmBg:
      'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  },
};

export function ConfirmDialog({
  open,
  variant = 'info',
  title,
  highlight,
  description,
  confirmText = '确定',
  cancelText = '取消',
  icon,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const theme = VARIANT_THEMES[variant];
  const IconNode = icon ?? theme.icon({ className: 'w-5 h-5' });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: 'rgba(74, 68, 88, 0.45)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-[22px] p-6 max-w-[340px] w-full relative"
            style={{
              boxShadow: '0 16px 48px rgba(161, 140, 209, 0.32)',
            }}
          >
            {/* 右上角关闭按钮 */}
            <button
              type="button"
              onClick={onCancel}
              aria-label="关闭"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-stone-100 transition-colors active:scale-95"
            >
              <X className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
            </button>

            {/* 渐变圆形图标 */}
            <div className="flex justify-center mb-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white"
                style={{
                  background: theme.gradient,
                  boxShadow: theme.shadow,
                }}
              >
                {IconNode}
              </div>
            </div>

            <h3 className="text-center text-[17px] font-bold text-foreground mb-2">
              {title}
            </h3>

            {highlight && (
              <p className="text-center text-[14px] text-muted leading-[1.5] mb-2">
                {theme.label ? `${theme.label}：` : ''}
                <span
                  className="font-bold mx-1"
                  style={{ color: '#4a4458' }}
                >
                  {highlight}
                </span>
                {description ?? ''}
              </p>
            )}
            {!highlight && description && (
              <p className="text-center text-[14px] text-muted leading-[1.5] mb-2">
                {description}
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-11 rounded-xl bg-card text-foreground font-semibold text-[14px] transition-all active:scale-95"
                style={{
                  boxShadow: 'inset 0 0 0 1px rgba(161, 140, 209, 0.18)',
                }}
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 h-11 rounded-xl text-white font-bold text-[14px] transition-all active:scale-95"
                style={{
                  background: theme.confirmBg,
                  boxShadow: theme.shadow,
                }}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}