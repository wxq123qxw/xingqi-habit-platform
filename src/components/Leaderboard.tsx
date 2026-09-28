import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import type { Habit, HabitColor } from '../types/habit';
import { calculateUserTotalEffort, rankWithTies } from '../utils/effort';
import { getMockCandidateEffort } from '../data/virtualCountdown';
import { findMockCandidate } from '../data/mockCandidates';
import { getFriendships } from '../store/friendStore';
import { findUserById } from '../store/authStore';
import { getHabits } from '../store/habitStore';
import { leaderboardApi } from '../api/endpoints';
import { getAuthToken } from '../api/client';
import type { LeaderboardEntry } from '../api/types';

interface LeaderRowData {
  id: string;
  name: string;
  color: HabitColor;
  effort: number;
  isCurrentUser: boolean;
}

interface LeaderboardProps {
  userHabits: Habit[];
  currentUserId: string;
}

/**
 * 努力值排行榜（spec §4.4 + Module 07 + Module 09）
 *
 * Module 09 双轨策略：
 * - **自己的 effort 永远用本地 userHabits 算**（用户刚打卡的数据最权威）
 *   - 即便后端 SQLite 没同步过来,本地一定准（顶部"总努力值"就是它）
 * - **好友的 effort** 主路径从 /api/leaderboard 拉（服务端聚合跨用户 effort）
 *   - Fallback：API 不可达时用本地（mock 候选人 → 虚拟 habit;真账号 → 本地 habits）
 *
 * 并列规则、Top 5、不变
 */
export function Leaderboard({ userHabits, currentUserId }: LeaderboardProps) {
  const [apiEntries, setApiEntries] = useState<LeaderboardEntry[] | null>(null);

  // 拉取服务端数据（只用来取好友 effort）
  useEffect(() => {
    if (!currentUserId) return;
    if (!getAuthToken()) {
      setApiEntries(null);
      return;
    }
    leaderboardApi
      .fetch()
      .then((res) => setApiEntries(res.entries))
      .catch(() => setApiEntries(null));
  }, [currentUserId, userHabits.length]); // userHabits.length 变化时重新拉

  // 自己的 effort —— 永远用本地（顶部"总努力值"就是这个）
  const me: LeaderRowData = {
    id: '__me__',
    name: '你',
    color: 'green',
    effort: calculateUserTotalEffort(userHabits),
    isCurrentUser: true,
  };

  // 朋友的 effort —— 优先 API,fallback 本地
  // 注意：API 路径下,自己的 entry 被丢弃（用 me 替代,确保数据权威）
  const apiHasFriends = !!apiEntries && apiEntries.some((e) => !e.isCurrentUser);
  const friendRows: LeaderRowData[] = apiHasFriends
    ? apiEntries!
        .filter((e) => !e.isCurrentUser)
        .map((e) => ({
          id: e.id,
          name: e.nickname,
          color: (e.color ?? 'slate') as HabitColor,
          effort: e.effort,
          isCurrentUser: false,
        }))
    : fallbackEntries(userHabits, currentUserId).filter((e) => !e.isCurrentUser);

  const entries: LeaderRowData[] = [me, ...friendRows];

  if (entries.length === 0) {
    return (
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-foreground">
            努力值排行榜
          </h2>
          <span className="text-[11px] text-muted">Top 5</span>
        </div>
        <div className="bg-card rounded-2xl px-5 py-8 text-center">
          <p className="text-[14px] text-foreground font-medium mb-1">
            还没有任何数据
          </p>
          <p className="text-[12px] text-muted">
            创建习惯、加好友后，排行榜就有内容了
          </p>
        </div>
      </div>
    );
  }

  const ranked = rankWithTies(entries, (e) => e.effort).slice(0, 5);

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold text-foreground">
          努力值排行榜
        </h2>
        <span className="text-[11px] text-muted">Top 5</span>
      </div>

      <div className="space-y-2">
        {ranked.map(({ item, rank }) => (
          <LeaderRow key={item.id} entry={item as LeaderRowData} rank={rank} />
        ))}
      </div>
    </div>
  );
}

/**
 * Fallback：API 不可达时本地算（完整版）
 * - 自己 effort = 本地 habits
 * - 好友（localStorage friendships 表）
 *   - mock 候选人 → 虚拟 habit effort
 *   - 真账号 → 本地 habits effort（跨设备不一致，但至少本地有数据）
 *
 * 触发场景：
 * - 后端没启动
 * - API token 丢失（sessionStorage 关浏览器就清）
 * - 后端 friendships 表没数据（前端写了 localStorage 但 API 双写失败）
 */
function fallbackEntries(
  userHabits: Habit[],
  currentUserId: string
): LeaderRowData[] {
  // 自己
  const me: LeaderRowData = {
    id: '__me__',
    name: '你',
    color: 'green',
    effort: calculateUserTotalEffort(userHabits),
    isCurrentUser: true,
  };
  const entries: LeaderRowData[] = [me];

  // 好友（localStorage friendships）
  const friendships = getFriendships(currentUserId);
  for (const f of friendships) {
    // 1) mock 候选人
    const candidate = findMockCandidate(f.friendId);
    if (candidate) {
      entries.push({
        id: f.friendId,
        name: f.friendNickname || candidate.nickname,
        color: (f.friendColor as HabitColor | undefined) ?? candidate.color,
        effort: getMockCandidateEffort(candidate.id),
        isCurrentUser: false,
      });
      continue;
    }
    // 2) 真账号 → 本地 habits 算
    const realUser = findUserById(f.friendId);
    if (!realUser) continue; // 用户不存在
    const realHabits = getHabits(f.friendId);
    entries.push({
      id: f.friendId,
      name: f.friendNickname || realUser.nickname,
      color: (f.friendColor as HabitColor | undefined) ?? 'slate',
      effort: calculateUserTotalEffort(realHabits),
      isCurrentUser: false,
    });
  }

  return entries;
}

function LeaderRow({
  entry,
  rank,
}: {
  entry: LeaderRowData;
  rank: number;
}) {
  const isMe = entry.isCurrentUser;
  const isChampion = rank === 1;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-[18px] transition-all ${
        isMe ? '' : ''
      }`}
      style={{
        background: '#ffffff',
        boxShadow: isChampion
          ? '0 4px 14px rgba(161, 140, 209, 0.18)'
          : '0 2px 8px rgba(161, 140, 209, 0.08)',
        border: isChampion
          ? '2px solid rgba(253, 219, 146, 0.6)'
          : '2px solid transparent',
      }}
    >
      {isChampion ? <ChampionBadge /> : <FlowerBadge />}

      {/* 头像:自己用薄荷蓝渐变,他用紫粉渐变 */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-bold shrink-0"
        style={{
          background: isMe
            ? 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)'
            : 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
        }}
        aria-hidden="true"
      >
        {entry.name.charAt(0)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-foreground truncate">
          {entry.name}
          {isMe && (
            <span
              className="text-[10px] font-semibold ml-1.5"
              style={{ color: '#a18cd1' }}
            >
              我
            </span>
          )}
        </div>
      </div>

      <div
        className="text-[15px] font-extrabold tabular-nums shrink-0"
        style={{ color: '#ff9a9e' }}
      >
        {entry.effort.toLocaleString()}
      </div>
    </div>
  );
}

function ChampionBadge() {
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white"
      style={{
        background: 'linear-gradient(135deg, #ffe259 0%, #ffa751 100%)',
        boxShadow:
          '0 4px 10px rgba(255, 167, 81, 0.45), inset 0 0 0 1px rgba(255,255,255,0.4)',
      }}
      aria-label="第 1 名"
    >
      <Crown className="w-5 h-5" strokeWidth={2.5} fill="currentColor" />
    </div>
  );
}

function FlowerBadge() {
  const petalAngles = Array.from({ length: 6 }, (_, i) => i * 60);
  return (
    <svg
      viewBox="0 0 36 36"
      className="w-9 h-9 shrink-0"
      aria-label="较低名次"
      role="img"
    >
      {petalAngles.map((angle) => (
        <ellipse
          key={angle}
          cx="18"
          cy="9"
          rx="3.2"
          ry="5"
          fill="#f8a5b9"
          transform={`rotate(${angle} 18 18)`}
        />
      ))}
      <circle cx="18" cy="18" r="4" fill="#fde68a" />
    </svg>
  );
}