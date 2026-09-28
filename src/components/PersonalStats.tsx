import type { Habit } from '../types/habit';
import {
  calculateUserTotalEffort,
  countHabitsByStatus,
  calculateHabitEffort,
} from '../utils/effort';
import { COLOR_HEX } from '../utils/colors';

interface PersonalStatsProps {
  habits: Habit[];
}

/**
 * 上半区：个人统计
 * - 总努力值 banner
 * - 已完成 / 进行中 计数卡片
 * - 各习惯的努力值列表（按 effort 降序，含迷你进度条）
 */
export function PersonalStats({ habits }: PersonalStatsProps) {
  // 过滤掉已删除习惯（spec §4.5：删除 → 努力值=0，且 UI 不展示）
  const visibleHabits = habits.filter((h) => h.status !== 'deleted');

  const total = calculateUserTotalEffort(visibleHabits);
  const counts = countHabitsByStatus(visibleHabits);
  const maxEffort = Math.max(...visibleHabits.map(calculateHabitEffort), 1);

  // 按 effort 降序
  const ranked = [...visibleHabits].sort(
    (a, b) => calculateHabitEffort(b) - calculateHabitEffort(a)
  );

  return (
    <div className="px-4 py-4 space-y-3">
      {/* 总努力值 banner — 大字用 gradient-text */}
      <div
        className="bg-card rounded-[22px] px-5 py-6 text-center relative overflow-hidden"
        style={{
          boxShadow: '0 4px 16px rgba(161, 140, 209, 0.12)',
        }}
      >
        {/* 装饰小星星 */}
        <span
          className="absolute"
          style={{
            top: 14,
            left: 20,
            fontSize: 16,
            color: '#fddb92',
            transform: 'rotate(-15deg)',
            textShadow: '0 2px 4px rgba(0,0,0,0.08)',
          }}
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="absolute"
          style={{
            bottom: 16,
            right: 22,
            fontSize: 16,
            color: '#fddb92',
            transform: 'rotate(20deg)',
            textShadow: '0 2px 4px rgba(0,0,0,0.08)',
          }}
          aria-hidden="true"
        >
          ✦
        </span>
        <div className="text-[11px] tracking-widest text-muted uppercase mb-2">
          总努力值
        </div>
        <div
          className="text-[48px] font-extrabold leading-none tabular-nums"
          style={{
            background:
              'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            margin: '6px 0',
          }}
        >
          {total.toLocaleString()}
        </div>
        <div className="text-[12px] text-muted mt-2">你的成就值</div>
      </div>

      {/* 2 个计数卡片 — 圆角加大,数字加粗 */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="bg-card rounded-[18px] px-4 py-3 text-center"
          style={{ boxShadow: '0 4px 14px rgba(161, 140, 209, 0.10)' }}
        >
          <div className="text-[26px] font-extrabold text-foreground tabular-nums leading-tight">
            {counts.completed}
          </div>
          <div className="text-[12px] text-muted mt-1">已完成习惯</div>
        </div>
        <div
          className="bg-card rounded-[18px] px-4 py-3 text-center"
          style={{ boxShadow: '0 4px 14px rgba(161, 140, 209, 0.10)' }}
        >
          <div className="text-[26px] font-extrabold text-foreground tabular-nums leading-tight">
            {counts.active}
          </div>
          <div className="text-[12px] text-muted mt-1">进行中习惯</div>
        </div>
      </div>

      {/* 各习惯努力值列表 */}
      <div
        className="bg-card rounded-[22px] px-4 py-4"
        style={{ boxShadow: '0 4px 14px rgba(161, 140, 209, 0.10)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-foreground">
            各习惯的努力值
          </div>
          <div className="text-[11px] text-muted">按数值排序</div>
        </div>
        <div className="space-y-3">
          {ranked.map((h) => {
            const effort = calculateHabitEffort(h);
            const pct = (effort / maxEffort) * 100;
            return (
              <div key={h.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: COLOR_HEX[h.color] }}
                      aria-hidden="true"
                    />
                    <span className="text-[13px] text-foreground truncate">
                      {h.name}
                    </span>
                    {h.status === 'completed' && (
                      <span className="text-[10px] text-muted bg-background px-1.5 py-0.5 rounded shrink-0">
                        已完成
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-bold text-foreground tabular-nums ml-2 shrink-0">
                    {effort}
                  </span>
                </div>
                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background:
                        `linear-gradient(90deg, ${COLOR_HEX[h.color]} 0%, ${COLOR_HEX[h.color]}99 100%)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {ranked.length === 0 && (
            <div className="text-center text-[13px] text-muted py-4">
              还没有习惯
            </div>
          )}
        </div>
      </div>
    </div>
  );
}