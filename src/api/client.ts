/**
 * API client 封装（Module 09 · 双轨方案）
 *
 * 设计：
 *   - 默认连接 http://localhost:3001（后端独立 Node 服务）
 *   - 失败自动降级 —— 业务层 catch 错误后走 localStorage
 *   - Bearer token 缓存到 sessionStorage（浏览器关掉就清，避免过期问题）
 *
 * 使用：
 *   import { api } from '../api/client';
 *   const { user } = await api.auth.register({ nickname, password });
 *
 * 错误处理：
 *   - 后端不可达 → throw { code: 'NETWORK_ERROR' }
 *   - 4xx/5xx → throw { code: 'HTTP_ERROR', status, error: <backend error code> }
 *   - 业务层根据需要决定是否 fallback
 */

import type { ApiError } from './types';

// ============================================================
// 常量
// ============================================================

export const API_BASE_URL =
  (typeof window !== 'undefined' && (window as unknown as { __API_BASE__?: string }).__API_BASE__) ||
  'http://localhost:3001';

const TOKEN_STORAGE_KEY = 'habit-platform-api-token';

// ============================================================
// 自定义错误类型
// ============================================================

export interface ApiNetworkError extends Error {
  code: 'NETWORK_ERROR';
}

export interface ApiHttpError extends Error {
  code: 'HTTP_ERROR';
  status: number;
  error: string;
}

export type ApiCallError = ApiNetworkError | ApiHttpError;

function isNetworkError(e: unknown): e is ApiNetworkError {
  return e instanceof TypeError && /fetch|network/i.test(e.message);
}

// ============================================================
// Token 管理（sessionStorage —— 浏览器关掉就清）
// ============================================================

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

// ============================================================
// fetch 封装
// ============================================================

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 不带 Authorization header（用于 register / login） */
  noAuth?: boolean;
  /** 超时（默认 5s） */
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!options.noAuth) {
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let body: ApiError = { error: 'unknown' };
      try {
        body = (await res.json()) as ApiError;
      } catch {
        /* ignore */
      }
      const err = new Error(
        body.error || `HTTP ${res.status}`
      ) as ApiCallError;
      (err as ApiHttpError).code = 'HTTP_ERROR';
      (err as ApiHttpError).status = res.status;
      (err as ApiHttpError).error = body.error;
      throw err;
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    clearTimeout(timeout);
    if (isNetworkError(e) || (e instanceof DOMException && e.name === 'AbortError')) {
      const err = new Error('Network error') as ApiNetworkError;
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    throw e;
  }
}

// ============================================================
// 健康检查（用于探测后端是否可用）
// ============================================================

export async function ping(): Promise<boolean> {
  try {
    await request<{ ok: boolean }>('/api/health', { noAuth: true, timeoutMs: 1500 });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// 后端可用性（可订阅 —— 给 UI 提示"离线模式"）
// ============================================================

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let lastOnline: boolean | null = null;

export function subscribeApiOnline(fn: Listener): () => void {
  listeners.add(fn);
  if (lastOnline !== null) fn(lastOnline);
  return () => listeners.delete(fn);
}

export function notifyApiOnline(online: boolean): void {
  if (lastOnline === online) return;
  lastOnline = online;
  for (const fn of listeners) {
    try {
      fn(online);
    } catch (e) {
      console.error('api online listener error', e);
    }
  }
}

/**
 * 探测一次后端可达性，更新 store + 通知监听
 */
export async function refreshApiStatus(): Promise<boolean> {
  const ok = await ping();
  notifyApiOnline(ok);
  return ok;
}