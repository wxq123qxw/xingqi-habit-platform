import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import type { Habit } from '../types/habit';
import { COLOR_HEX } from '../utils/colors';

interface HabitCardProps {
  habit: Habit;
  onCheckIn: (habitId: string) => void;
  index?: number;
}

export function HabitCard({
  habit,
  onCheckIn,
  index = 0,
}: HabitCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tagHex = COLOR_HEX[habit.color];

  // 进度条分段（已坚持 / 缺勤 / 剩余）
  const total = habit.totalDays || 1;
  const checkedPct = Math.min(100, (habit.checkInCount / total) * 100);
  const absentPct = Math.min(
    100 - checkedPct,
    (habit.absentCount / total) * 100,
  );

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.96 }}
      transition={{
        duration: 0.45,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -2 }}
      className="w-full bg-card rounded-[22px] overflow-hidden transition-shadow hover:shadow-soft-hover"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.12)',
      }}
    >
      {/* 卡片主体（点击切换展开/收起详情） */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-5 flex flex-row items-center justify-between cursor-pointer"
        role="button"
        aria-expanded={expanded}
        aria-label={`${habit.name} 详情`}
      >
        <div className="flex flex-col gap-2 min-w-0 flex-1 pr-3">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[22px] leading-[1.3] font-bold text-foreground truncate">
              {habit.name}
            </h2>
            <ChevronDown
              className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded shrink-0"
              style={{ backgroundColor: tagHex }}
              aria-hidden="true"
            />
            <span className="text-[13px] leading-[1.4] text-muted">
              已坚持 {habit.checkInCount} 天 · 目标 {habit.totalDays} 天 ·
              <span
                style={{
                  color: habit.absentCount > 0 ? '#c97b5f' : undefined,
                  fontWeight: habit.absentCount > 0 ? 600 : undefined,
                }}
              >
                缺勤 {habit.absentCount} 次
              </span>
            </span>
          </div>
          {/* 进度条分段：薄荷绿(已坚持) + 棕红(缺勤) + 灰(剩余) */}
          <div
            className="h-1.5 rounded-full overflow-hidden mt-1 flex"
            style={{ background: '#f0edf5' }}
            aria-hidden="true"
          >
            {checkedPct > 0 && (
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${checkedPct}%`,
                  background:
                    'linear-gradient(90deg, #84fab0 0%, #8fd3f4 100%)',
                }}
              />
            )}
            {absentPct > 0 && (
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${absentPct}%`,
                  background:
                    'linear-gradient(90deg, #d29572 0%, #b86040 100%)',
                }}
              />
            )}
          </div>
        </div>

        {/* 打卡按钮（圆形渐变,点击不触发卡片展开） */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckIn(habit.id);
          }}
          aria-label="打卡"
          role="checkbox"
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
            boxShadow:
              '0 6px 16px rgba(132, 250, 176, 0.4)',
            color: '#ffffff',
          }}
        >
          <Check
            className="w-6 h-6"
            strokeWidth={3.5}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* 详情区（展开时显示三个字段） */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-stone-200"
          >
            <div className="px-5 py-3 bg-stone-50/60 grid grid-cols-3 gap-3">
              <DetailItem label="提醒方式" value={habit.reminderType} />
              <DetailItem label="提醒时间" value={habit.reminderTime} />
              <DetailItem
                label="难度"
                value={renderDifficulty(habit.difficulty)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-muted leading-[1.2]">{label}</div>
      <div className="text-[14px] text-foreground font-medium leading-[1.3]">
        {value}
      </div>
    </div>
  );
}

/** 难度 1-5 → ★ 填充 + ☆ 空白 */
function renderDifficulty(d: number): string {
  const filled = Math.max(0, Math.min(5, d));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}