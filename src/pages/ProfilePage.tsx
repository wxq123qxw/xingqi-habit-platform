import { useEffect, useState } from 'react';
import {
  User,
  Users,
  Settings,
  ChevronRight,
  LogIn,
} from 'lucide-react';
import { ProfileLogin } from './ProfileLogin';
import { ProfileFriends } from './ProfileFriends';
import { ProfileSettings } from './ProfileSettings';
import { getCurrentUser, type CurrentUser } from '../store/authStore';

type ProfileView = 'menu' | 'login' | 'friends' | 'settings';
export type { ProfileView };

interface ProfilePageProps {
  /**
   * 外部请求打开的子视图（一次性的）
   * - 当 App.tsx 需要"从外部跳到某个子页（如 Tab 2 → 'login'）"时使用
   * - mount 时会同步到内部 view，并通过 onExtraConsumed 通知 App 清除
   * - 默认 'menu'
   */
  extraView?: ProfileView | null;
  /** 当 extraView 被消费后回调，让 App 清除 state */
  onExtraConsumed?: () => void;
  /** Module 09:退出登录时通知 App 跳回星启页（替代原跳回 ProfileLogin） */
  onLogoutToSplash?: () => void;
}

/**
 * Tab 4 个人中心（外壳）
 * - 顶部 page-header（标题 + 副标题）
 * - 已登录：顶部加一张"我的账号"卡片（昵称 + ID）
 * - 三个入口卡片：注册/登录、好友、设置
 * - 内部 state 控制子页切换（不跳出 Tab 栈，spec §4.1）
 *
 * 子页路由：
 * - 'login'     → ProfileLogin（已实现注册/登录/退出）
 * - 'friends'   → ProfileFriends
 * - 'settings'  → ProfileSettings
 */
export function ProfilePage({
  extraView = null,
  onExtraConsumed,
  onLogoutToSplash,
}: ProfilePageProps = {}) {
  const [view, setView] = useState<ProfileView>('menu');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(
    () => getCurrentUser()
  );

  /**
   * 同步外部 extraView → 内部 view（一次性消费）
   * 触发场景：用户在 Tab 2 未登录 → 点"去登录" → App 同时 setTab('tab4') + setExtraView('login')
   * 我们这里把 view 切到 login，然后调 onExtraConsumed 让 App 清除 extraView
   * 防止 stale prop 在下次 mount 时又把 view 强制设回 login（破坏用户手动返回操作）
   */
  useEffect(() => {
    if (extraView) {
      setView(extraView);
      onExtraConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraView]);

  // 子页路由
  if (view === 'login') {
    return (
      <ProfileLogin
        onBack={() => setView('menu')}
        onUserChange={(user) => {
          setCurrentUser(user);
          // Module 09:用户退出登录（user=null）时,通知 App 跳回星启页
          if (user === null) {
            onLogoutToSplash?.();
          }
        }}
      />
    );
  }
  if (view === 'friends')
    return <ProfileFriends onBack={() => setView('menu')} />;
  if (view === 'settings')
    return (
      <ProfileSettings
        onBack={() => setView('menu')}
        onUserChange={setCurrentUser}
      />
    );

  // 主菜单
  return (
    <>
      <header className="page-header">
        <span className="header-greeting">个人中心</span>
        <span className="header-date">身份 · 好友 · 设置</span>
      </header>

      <main className="px-4 pt-2 pb-24 space-y-3">
        {/* 已登录态：顶部账号卡 — 渐变头像 + 圆角卡片 */}
        {currentUser && (
          <button
            type="button"
            onClick={() => setView('login')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[18px] text-left transition-all active:scale-[0.98] group"
            style={{
              background:
                'linear-gradient(135deg, rgba(161,140,209,0.12) 0%, rgba(251,194,235,0.12) 100%)',
              boxShadow:
                '0 4px 14px rgba(161, 140, 209, 0.10), inset 0 0 0 1px rgba(255,255,255,0.6)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold shrink-0"
              style={{
                background:
                  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
                boxShadow: '0 3px 8px rgba(161,140,209,0.35)',
              }}
            >
              {currentUser.nickname.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-foreground truncate">
                {currentUser.nickname}
              </div>
              <div className="text-[11px] text-muted font-mono truncate">
                ID: {currentUser.id}
              </div>
            </div>
            <ChevronRight
              className="w-4 h-4 text-muted shrink-0 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>
        )}

        {/* 未登录态：引导卡 */}
        {!currentUser && (
          <button
            type="button"
            onClick={() => setView('login')}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-card ring-1 ring-dashed ring-border rounded-xl text-left hover:bg-stone-50 active:scale-[0.98] transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-stone-100 text-muted flex items-center justify-center shrink-0">
              <LogIn className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-foreground">
                注册 / 登录
              </div>
              <div className="text-[12px] text-muted mt-0.5">
                生成你的唯一 ID
              </div>
            </div>
            <ChevronRight
              className="w-4 h-4 text-muted shrink-0 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>
        )}

        <MenuCard
          icon={Users}
          title="好友"
          desc="添加好友 / 处理申请"
          onClick={() => setView('friends')}
        />
        <MenuCard
          icon={Settings}
          title="设置"
          desc="删除 / 恢复 / 修改"
          onClick={() => setView('settings')}
        />
      </main>
    </>
  );
}

function MenuCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof User;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-card rounded-[18px] text-left transition-all active:scale-[0.98] group shadow-soft-hover"
      style={{
        boxShadow: '0 4px 14px rgba(161, 140, 209, 0.08)',
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: 'rgba(161,140,209,0.12)',
          color: '#a18cd1',
        }}
      >
        <Icon className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        <div className="text-[12px] text-muted mt-0.5">{desc}</div>
      </div>
      <ChevronRight
        className="w-4 h-4 text-muted shrink-0 transition-transform group-hover:translate-x-1"
        aria-hidden="true"
      />
    </button>
  );
}