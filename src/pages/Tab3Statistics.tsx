import type { Habit } from '../types/habit';
import { PersonalStats } from '../components/PersonalStats';
import { Leaderboard } from '../components/Leaderboard';

interface Tab3StatisticsProps {
  habits: Habit[];
  currentUserId: string;
}

/**
 * Tab 3 统计中心
 * - 上半区：PersonalStats（个人统计）
 * - 下半区：Leaderboard（Top 5 排行）
 * - 上下半 1:1 布局，各自独立滚动
 * - 中间区域高度 = 100vh - 68px (page-header + padding-top) - 60px (BottomTabBar)
 */
export function Tab3Statistics({ habits, currentUserId }: Tab3StatisticsProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="app-shell">
        <header className="page-header">
          <span className="header-greeting">统计中心</span>
          <span className="header-date">用数字看见坚持</span>
        </header>

        <div
          className="flex flex-col"
          style={{ height: 'calc(100vh - 68px - 60px)' }}
        >
          {/* 上半区 */}
          <div className="h-1/2 overflow-y-auto pb-2">
            <PersonalStats habits={habits} />
          </div>

          {/* 中间分割线 */}
          <div
            className="h-px bg-border mx-4"
            aria-hidden="true"
          />

          {/* 下半区 */}
          <div className="h-1/2 overflow-y-auto">
            <Leaderboard userHabits={habits} currentUserId={currentUserId} />
          </div>
        </div>
      </div>
    </div>
  );
}