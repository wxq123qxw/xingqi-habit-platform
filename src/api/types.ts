/**
 * 后端 API 类型定义（Module 09）
 *
 * 与 backend/src/server.cjs 返回的 JSON 一一对应。
 * 客户端所有 store 都基于这些类型做双轨（API 优先 / localStorage fallback）。
 */

// ============================================================
// 通用
// ============================================================

export interface ApiError {
  error: string;
  message?: string;
}

export interface PublicUser {
  id: string;
  nickname: string;
  createdAt: number;
}

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface ApiHealth {
  ok: boolean;
  ts: number;
  users: number;
}

// ============================================================
// 习惯
// ============================================================

export interface Habit {
  id: string;
  userId: string;
  name: string;
  color: string;
  totalDays: number;
  checkInCount: number;
  absentCount: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'deleted';
  createdAt: number;
  reminderType: string;
  reminderTime: string;
  difficulty: number;
}

export interface CheckIn {
  habitId: string;
  date: string;
  timestamp: number;
}

export interface HabitsResponse {
  habits: Habit[];
}

export interface CheckInsResponse {
  checkIns: CheckIn[];
}

export interface HabitResponse {
  habit: Habit;
}

// ============================================================
// 好友
// ============================================================

export interface Friend {
  friendId: string;
  friendNickname: string;
  friendColor: string | null;
  establishedAt: number;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserNickname: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface FriendsResponse {
  friends: Friend[];
}

export interface FriendRequestsResponse {
  requests: FriendRequest[];
}

// ============================================================
// 排行榜
// ============================================================

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  color?: string | null;
  effort: number;
  isCurrentUser: boolean;
  rank: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

// ============================================================
// 备份
// ============================================================

export interface BackupInfo {
  id: number;
  createdAt: number;
  sizeBytes: number;
  encryptedPath: string;
  rowCount: number;
  note: string | null;
}

export interface BackupsResponse {
  backups: BackupInfo[];
}

export interface BackupRunResponse {
  ok: boolean;
  id?: number;
  file?: string;
  sizeBytes?: number;
  rowCount?: number;
  error?: string;
}