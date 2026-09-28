/**
 * API endpoints 封装（Module 09）
 *
 * 每个 endpoint 返回 Promise，失败时 throw ApiCallError。
 * 业务层（store）负责决定 catch 后是否降级到 localStorage。
 *
 * 调用约定：
 *   - 所有 endpoint 都返回后端的 JSON 响应（已经解包）
 *   - 抛出的 ApiCallError 携带 status + error code，store 用来决定 fallback
 */

import { request } from './client';
import type {
  AuthResponse,
  PublicUser,
  Habit,
  HabitsResponse,
  HabitResponse,
  CheckInsResponse,
  FriendsResponse,
  FriendRequestsResponse,
  LeaderboardResponse,
  BackupsResponse,
  BackupRunResponse,
} from './types';

// ============================================================
// Auth
// ============================================================

export const authApi = {
  register(input: { nickname: string; password: string }) {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: input,
      noAuth: true,
    });
  },

  login(input: { nickname: string; password: string }) {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: input,
      noAuth: true,
    });
  },

  me() {
    return request<{ user: PublicUser }>('/api/auth/me');
  },

  changePassword(input: {
    oldPassword: string;
    newPassword: string;
  }) {
    return request<{ user: PublicUser }>('/api/auth/password', {
      method: 'POST',
      body: input,
    });
  },
};

// ============================================================
// Habits
// ============================================================

export const habitsApi = {
  list() {
    return request<HabitsResponse>('/api/habits');
  },

  create(input: {
    name: string;
    totalDays: number;
    reminderType: string;
    reminderTime: string;
    color: string;
    difficulty: number;
  }) {
    return request<HabitResponse>('/api/habits', {
      method: 'POST',
      body: input,
    });
  },

  patch(id: string, patch: Partial<Habit>) {
    return request<HabitResponse>(`/api/habits/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
    });
  },

  checkIn(id: string) {
    return request<HabitResponse>(
      `/api/habits/${encodeURIComponent(id)}/checkin`,
      { method: 'POST' }
    );
  },

  /** 软删（status='deleted' 或 'completed'） */
  softDelete(id: string) {
    return request<{ ok: true }>(`/api/habits/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** 恢复 */
  restore(id: string) {
    return request<HabitResponse>(
      `/api/habits/${encodeURIComponent(id)}/restore`,
      { method: 'POST' }
    );
  },

  /** 彻底删除 */
  purge(id: string) {
    return request<{ ok: true }>(
      `/api/habits/${encodeURIComponent(id)}/purge`,
      { method: 'POST' }
    );
  },

  listCheckIns() {
    return request<CheckInsResponse>('/api/habits/checkins');
  },
};

// ============================================================
// Friends
// ============================================================

export const friendsApi = {
  list() {
    return request<FriendsResponse>('/api/friends');
  },

  remove(friendId: string) {
    return request<{ ok: true }>(
      `/api/friends/${encodeURIComponent(friendId)}`,
      { method: 'DELETE' }
    );
  },

  // requests
  listRequests() {
    return request<FriendRequestsResponse>('/api/friends/requests');
  },

  sendRequest(targetId: string) {
    return request<{ ok: true; requestId: string }>(
      '/api/friends/requests',
      { method: 'POST', body: { targetId } }
    );
  },

  accept(requestId: string) {
    return request<{ ok: true }>(
      `/api/friends/requests/${encodeURIComponent(requestId)}/accept`,
      { method: 'POST' }
    );
  },

  /**
   * 接受好友申请（按"申请人 ID"匹配 —— 前端 fire-and-forget 路径用）
   *
   * 为什么需要：前端生成的 requestId (`req-${Date.now()}-xxx`) 跟后端的
   *   (`req-${hex}`) 命名空间不同,按 ID 接受永远 404。
   *   改用申请人 ID 匹配,后端按 (fromUserId, toUserId=currentUser) 找最新
   *   pending 申请来接受 —— 跟 ID 无关。
   */
  acceptFrom(fromUserId: string) {
    return request<{ ok: true }>('/api/friends/requests/accept-from', {
      method: 'POST',
      body: { fromUserId },
    });
  },

  reject(requestId: string) {
    return request<{ ok: true }>(
      `/api/friends/requests/${encodeURIComponent(requestId)}/reject`,
      { method: 'POST' }
    );
  },
};

// ============================================================
// Leaderboard
// ============================================================

export const leaderboardApi = {
  fetch() {
    return request<LeaderboardResponse>('/api/leaderboard');
  },
};

// ============================================================
// Backups（Module 09 · 后端统一存储的备份）
// ============================================================

export const backupsApi = {
  list() {
    return request<BackupsResponse>('/api/backups');
  },

  runNow() {
    return request<BackupRunResponse>('/api/backups/run', {
      method: 'POST',
    });
  },

  restore(id: number) {
    return request<BackupRunResponse>(
      `/api/backups/${id}/restore`,
      { method: 'POST' }
    );
  },
};