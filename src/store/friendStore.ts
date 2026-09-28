/**
 * 好友系统状态管理（mock 后端版本）
 *
 * 数据存储：
 * - habit-platform-friendships   好友关系数组（按 userId 过滤）
 * - habit-platform-friend-requests 申请数组（pending/accepted/rejected）
 *
 * 核心 API：
 * - ensureInitialized(userId)   首次进入好友页时初始化 mock 数据（幂等）
 * - getFriendships(userId)       当前用户的好友关系列表
 * - getPendingRequests(userId)   当前用户收到的待处理申请
 * - sendFriendRequest(from, to) 发起申请（自动跳过好友关系已存在 / 已申请过）
 * - acceptFriendRequest(reqId)  接受申请 → 同时创建好友关系 + 标记申请 accepted
 * - rejectFriendRequest(reqId)  拒绝申请 → 仅标记 rejected，不创建好友
 * - removeFriendship(userId, friendId) 解除好友关系
 *
 * 注：模块 07 真后端上线后，所有方法改为调 API。
 */

import { mockCandidates } from '../data/mockCandidates';
import { findUserById } from './authStore';
import { friendsApi } from '../api/endpoints';

const FRIENDSHIPS_KEY = 'habit-platform-friendships';
const REQUESTS_KEY = 'habit-platform-friend-requests';
const INIT_FLAG_KEY = 'habit-platform-friend-initialized';

export interface Friendship {
  userId: string;             // 当前用户 ID（建立者）
  friendId: string;           // 好友 ID
  friendNickname: string;     // 冗余存储，避免每次查表
  friendColor?: string;       // 可选，头像色（mock 候选人才有）
  establishedAt: number;      // 建立时间
}

export type RequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequest {
  id: string;                 // 申请 ID
  fromUserId: string;         // 申请人
  fromUserNickname: string;
  toUserId: string;           // 接收人
  status: RequestStatus;
  createdAt: number;
  resolvedAt?: number;        // 处理时间
}

/* ============================================================
 * localStorage 读写
 * ========================================================== */

function readFriendships(): Friendship[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(FRIENDSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFriendships(items: Friendship[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FRIENDSHIPS_KEY, JSON.stringify(items));
}

function readRequests(): FriendRequest[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(REQUESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRequests(items: FriendRequest[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REQUESTS_KEY, JSON.stringify(items));
}

/* ============================================================
 * 读 API
 * ========================================================== */

export function getFriendships(userId: string): Friendship[] {
  return readFriendships().filter((f) => f.userId === userId);
}

export function getPendingRequests(userId: string): FriendRequest[] {
  return readRequests()
    .filter((r) => r.toUserId === userId && r.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 判断两用户是否已是好友 */
export function isFriend(userId: string, friendId: string): boolean {
  return readFriendships().some(
    (f) => f.userId === userId && f.friendId === friendId
  );
}

/** 判断是否已有"待处理 / 已接受"申请（任意方向） */
export function hasOutgoingRequest(
  fromUserId: string,
  toUserId: string
): boolean {
  return readRequests().some(
    (r) =>
      r.fromUserId === fromUserId &&
      r.toUserId === toUserId &&
      (r.status === 'pending' || r.status === 'accepted')
  );
}

/* ============================================================
 * 写 API
 * ========================================================== */

export interface SendRequestResult {
  ok: boolean;
  reason?: 'self' | 'already_friend' | 'already_requested';
  request?: FriendRequest;
}

/** 发起好友申请 */
export function sendFriendRequest(
  fromUserId: string,
  fromUserNickname: string,
  toUserId: string
): SendRequestResult {
  if (fromUserId === toUserId) {
    return { ok: false, reason: 'self' };
  }
  if (isFriend(fromUserId, toUserId)) {
    return { ok: false, reason: 'already_friend' };
  }
  if (hasOutgoingRequest(fromUserId, toUserId)) {
    return { ok: false, reason: 'already_requested' };
  }

  const req: FriendRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromUserId,
    fromUserNickname,
    toUserId,
    status: 'pending',
    createdAt: Date.now(),
  };

  const all = readRequests();
  all.push(req);
  writeRequests(all);

  // 双写到后端
  friendsApi.sendRequest(toUserId).catch(() => {/* ignore */});

  return { ok: true, request: req };
}

/** 接受申请 → 创建好友关系 + 标记申请 accepted */
export function acceptFriendRequest(
  requestId: string
): Friendship | null {
  const all = readRequests();
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx === -1) return null;
  const req = all[idx];
  if (req.status !== 'pending') return null;

  // 标记申请 accepted
  all[idx] = { ...req, status: 'accepted', resolvedAt: Date.now() };
  writeRequests(all);

  // 创建好友关系（双向各一条，方便后续取对方的好友列表）
  const friendships = readFriendships();
  const now = Date.now();
  const candidate = mockCandidates.find((c) => c.id === req.fromUserId);
  // 接收方（toUser）的真实昵称 —— 用于申请人那边的 friendNickname
  // 之前这里硬编码成 "你" 是 placeholder bug，现在查真实昵称
  const toUserNickname = findUserById(req.toUserId)?.nickname ?? '未知用户';

  // 接收方 → 申请人
  if (!friendships.some((f) => f.userId === req.toUserId && f.friendId === req.fromUserId)) {
    friendships.push({
      userId: req.toUserId,
      friendId: req.fromUserId,
      friendNickname: req.fromUserNickname,
      friendColor: candidate?.color,
      establishedAt: now,
    });
  }
  // 申请人 → 接收方：用接收方真实昵称
  if (!friendships.some((f) => f.userId === req.fromUserId && f.friendId === req.toUserId)) {
    friendships.push({
      userId: req.fromUserId,
      friendId: req.toUserId,
      friendNickname: toUserNickname,
      establishedAt: now,
    });
  }
  writeFriendships(friendships);

  // 双写到后端（按申请人 ID 匹配 —— 前端的 requestId 跟后端命名空间不同,按 ID 查不到）
  friendsApi.acceptFrom(req.fromUserId).catch(() => {/* ignore */});

  return friendships.find(
    (f) => f.userId === req.toUserId && f.friendId === req.fromUserId
  ) ?? null;
}

/** 拒绝申请 → 仅标记 rejected */
export function rejectFriendRequest(requestId: string): boolean {
  const all = readRequests();
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx === -1) return false;
  const req = all[idx];
  if (req.status !== 'pending') return false;
  all[idx] = { ...req, status: 'rejected', resolvedAt: Date.now() };
  writeRequests(all);

  // 双写到后端
  friendsApi.reject(requestId).catch(() => {/* ignore */});

  return true;
}

/** 解除好友关系（双向都删） */
export function removeFriendship(userId: string, friendId: string): boolean {
  const friendships = readFriendships();
  const filtered = friendships.filter(
    (f) =>
      !(
        (f.userId === userId && f.friendId === friendId) ||
        (f.userId === friendId && f.friendId === userId)
      )
  );
  if (filtered.length === friendships.length) return false;
  writeFriendships(filtered);

  // 双写到后端
  friendsApi.remove(friendId).catch(() => {/* ignore */});

  return true;
}

/** 调试用：清掉所有好友系统数据 */
export function debugResetFriends(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(FRIENDSHIPS_KEY);
  window.localStorage.removeItem(REQUESTS_KEY);
  // 清掉所有初始化 flag
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(INIT_FLAG_KEY)) {
      window.localStorage.removeItem(k);
    }
  }
}

/**
 * 迁移旧数据：清掉 friendships 里所有 friendNickname === '你' 的占位
 *
 * 背景：之前 acceptFriendRequest 给申请人那边硬编码 friendNickname='你'，
 *      已加过好友的用户 localStorage 里就残留了这些脏数据。
 *      修代码只能让新加的好友显示正确昵称；旧数据需要手动迁移。
 *
 * 行为：
 *   - 遍历所有 friendships
 *   - 如果 friendNickname === '你' → 用 findUserById(friendId) 查真实昵称替换
 *   - 查不到 → 删除该条 friendship（数据已损坏，不应该显示孤鬼）
 *   - 改动后写回 localStorage
 *
 * 调用时机：App 启动时（getCurrentUser / 任意好友读取前）调用一次
 */
export function migrateFriendNicknames(): void {
  if (typeof window === 'undefined') return;
  const list = readFriendships();
  let changed = false;
  const filtered: Friendship[] = [];
  for (const f of list) {
    if (f.friendNickname === '你' || !f.friendNickname) {
      const real = findUserById(f.friendId);
      if (real) {
        filtered.push({ ...f, friendNickname: real.nickname });
        changed = true;
      } else {
        // 对方账号不存在（被删了 / 数据损坏）→ 删除该条
        changed = true;
        continue;
      }
    } else {
      filtered.push(f);
    }
  }
  if (changed) writeFriendships(filtered);
}