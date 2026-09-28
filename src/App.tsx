import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ListChecks,
  Plus,
  BarChart3,
  User,
  Music,
  Music2,
} from 'lucide-react';
import './App.css';
import {
  getHabits,
  runDailyAbsentCheck,
  hasCheckedInToday,
  addCheckIn,
  createHabit,
} from './store/habitStore';
import { getCurrentUser, logout, subscribeAuth, type CurrentUser } from './store/authStore';
import {
  findPendingHabits,
  findHabitsAtCurrentMinute,
  markPushedToday,
  markAnimatedToday,
  cleanupOldPushedRecords,
  cleanupOldAnimatedRecords,
} from './store/notificationStore';
import { pickAnimationOrFallback } from './data/animationManifest';
import {
  enqueueAnimation,
  getAnimationQueueSnapshot,
  skipCurrent,
  clearAnimationQueue,
  subscribeAnimationQueue,
} from './store/animationQueue';
import { migrateFriendNicknames } from './store/friendStore';
import {
  sendBrowserNotification,
  getNotificationStatus,
} from './utils/pushNotification';
import { getAuthToken, clearAuthToken } from './api/client';
import { consumeReminderText } from './utils/reminderLibrary';
import { HabitCard } from './components/HabitCard';
import { BootScreen } from './components/BootScreen';
import {
  useMusicState,
  toggleMusic,
} from './store/backgroundMusic';
import { CreateHabitForm } from './pages/CreateHabitForm';
import { Tab3Statistics } from './pages/Tab3Statistics';
import { ProfilePage, type ProfileView } from './pages/ProfilePage';
import { SplashPage } from './pages/SplashPage';
import { AuthPage } from './pages/AuthPage';
import type { Habit, NewHabitInput } from './types/habit';
import { todayCN } from './utils/date';
import { ElectronTitleBar } from './components/ElectronTitleBar';

/** App 启动三阶段（Module 09 新增） */
type Stage = 'splash' | 'auth' | 'app';

type TabKey = 'tab1' | 'tab2' | 'tab3' | 'tab4';

interface TabConfig {
  key: TabKey;
  label: string;
  Icon: typeof ListChecks;
}

const TABS: TabConfig[] = [
  { key: 'tab1', label: '习惯', Icon: ListChecks },
  { key: 'tab2', label: '创建', Icon: Plus },
  { key: 'tab3', label: '统计', Icon: BarChart3 },
  { key: 'tab4', label: '我的', Icon: User },
];

/**
 * 当前 HH:MM（两位补 0）
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 当前 HH:MM
 */
function currentHHMM(): string {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function App() {
  const [tab, setTab] = useState<TabKey>('tab1');
  const [habits, setHabits] = useState<Habit[]>([]);

  /**
   * 外部 push 给 Tab 4 的初始视图（一次性的）
   */
  const [extraProfileView, setExtraProfileView] =
    useState<ProfileView | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(
    () => getCurrentUser()
  );

  /** Module 09 三阶段:splash(星启) → auth(登录注册) → app(主界面) */
  const [stage, setStage] = useState<Stage>(() =>
    currentUser ? 'splash' : 'splash',
  ); // 总是从 splash 开始
  const [authResetKey, setAuthResetKey] = useState(0); // 触发 AuthPage 重置

  /** Module 09 (2026-09-26): Electron 自定义 title bar */
  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const inElectron = window.habitPlatform?.isElectron === true;
    setIsElectron(inElectron);
    if (inElectron) {
      document.documentElement.dataset.electron = 'true';
      document.title = '星启';
    } else {
      delete document.documentElement.dataset.electron;
    }
  }, []);

  // Module 07：启动时清掉旧 friendships 里的 friendNickname='你' 占位
  useEffect(() => {
    migrateFriendNicknames();
  }, []);
  useEffect(() => {
    return subscribeAuth(() => setCurrentUser(getCurrentUser()));
  }, []);

  /**
   * Module 09 安全加固：token 健康度检查
   *
   * 场景：用户已登录（localStorage 有 currentUser）但 sessionStorage 没 token
   *   - 浏览器关闭 → sessionStorage 清空 → 重启后 token 失效（sessionStorage 仅存活于标签页）
   *   - 后端重启 → BACKUP_PASSWORD 可能变化 → 旧 token 签名失效
   *   - 用户登出 → token 已清（正常路径）
   *
   * 行为：currentUser 存在但没 token → "软退出"：
   *   - 清掉 currentUser（强制走 auth 页重新登录）
   *   - 清掉残留 token（万一有）
   *
   * 注：双轨方案下 localStorage 数据仍然可用，但没 token 时所有 API 都会 401。
   *      软退出让用户走 auth，重新登录拿到新 token，后端数据才能再次同步。
   */
  useEffect(() => {
    if (!currentUser) return;
    if (getAuthToken()) return; // 有效 token → 跳过
    // 没 token 但有 currentUser → 软退出
    console.warn('[auth] token missing while localStorage has currentUser — soft logout');
    clearAuthToken(); // 避免残留
    logout(); // 清 currentUser + 触发 notifyAuthChange → setCurrentUser(null)
    setStage('auth');
    setAuthResetKey((k) => k + 1);
  }, []); // 仅在 mount 跑一次

  const userId = currentUser?.id ?? '';

  /** 退出登录后返回星启页（ProfilePage 调用） */
  const handleLogoutToSplash = () => {
    setCurrentUser(null);
    setStage('splash');
    setAuthResetKey((k) => k + 1); // 重置 AuthPage 内部状态
  };

  /** 星启 → 登录注册 */
  const handleEnterAuth = () => {
    setStage('auth');
  };

  /** 登录注册成功 → 直接进 app */
  const handleAuthSuccess = (_user: CurrentUser) => {
    setStage('app');
  };

  /** 星启自动 warp 后跳 app（已登录时） */
  const handleSplashAutoSkip = () => {
    setStage('app');
  };

  // ============================================================
  // Effect 1: 加载 + 缺勤次数计算
  // ============================================================
  useEffect(() => {
    if (!userId) {
      setHabits([]);
      return;
    }
    // 计算缺勤次数（idempotent 重新计算，跨日改时间可还原）
    runDailyAbsentCheck(userId);
    setHabits(getHabits(userId));
  }, [tab, userId]);

  // ============================================================
  // Effect 2: 提醒动画（累积型）
  // 用户打开 App 时扫描，补弹"已过 reminderTime 但今日未打卡"的 habit
  // 多个 habit 依次入队，AnimationQueuePlayer 依次播放
  // ============================================================
  // 【修复 Bug 2】之前 deps 用 [userId, habits],导致切 tab 时
  // setHabits 触发 effect 重跑（虽然有 isAnimatedToday 过滤,
  // 但仍会出现 AudioContext 警告 + 浪费 CPU）
  // 改成 deps=[userId, habits.length] + ref 跟踪实际变化,
  // 只在 habits 数量变化（新增/删除 habit）时才扫描。
  const prevHabitsLengthRef = useRef<number>(-1);
  useEffect(() => {
    if (!userId) return;
    // stage 不为 app → 不扫（避免 splash/auth 阶段误入队）
    if (stage !== 'app') return;

    const length = habits.length;
    // 数量没变（且已初始化）→ 不重扫
    if (prevHabitsLengthRef.current >= 0 && prevHabitsLengthRef.current === length) {
      return;
    }
    prevHabitsLengthRef.current = length;

    cleanupOldAnimatedRecords(userId);

    const hhmm = currentHHMM();
    const pending = findPendingHabits(
      userId,
      habits,
      hhmm,
      (habitId) => hasCheckedInToday(userId, habitId)
    );
    if (pending.length === 0) return;

    pending.forEach(({ habitId, habitName, reminderType }) => {
      const anim = pickAnimationOrFallback(reminderType);
      enqueueAnimation({
        id: `reminder-anim-${habitId}-${Date.now()}`,
        mp4Url: anim.mp4Url,
        backgroundColor: anim.backgroundColor,
        habitName,
        reminderType,
      });
      markAnimatedToday(userId, habitId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, habits.length, stage]);

  // ============================================================
  // Effect 3: 提醒通知（定时型）
  // 本地时间 == habit.reminderTime 时自动推，不管 App 是否打开
  // ============================================================
  useEffect(() => {
    if (!userId) return;

    cleanupOldPushedRecords(userId);

    const checkAndPush = () => {
      if (getNotificationStatus() !== 'granted') return;

      const hhmm = currentHHMM();
      const pending = findHabitsAtCurrentMinute(
        userId,
        habits,
        hhmm,
        (habitId) => hasCheckedInToday(userId, habitId)
      );
      if (pending.length === 0) return;

      pending.forEach(({ habitId, habitName, reminderType }) => {
        const body = consumeReminderText(reminderType, habitName);
        sendBrowserNotification({
          title: habitName,
          body,
          tag: `reminder-notif-${habitId}`,
          onClick: () => setTab('tab1'),
        });
        markPushedToday(userId, habitId);
      });
    };

    checkAndPush();
    // 每 30 秒检查一次（确保整点分钟内能捕捉到 HH:MM 切换）
    const interval = setInterval(checkAndPush, 30 * 1000);
    return () => clearInterval(interval);
  }, [userId, habits]);

  const handleCheckIn = (habitId: string) => {
    if (!userId) return;
    const ok = addCheckIn(userId, habitId);
    if (!ok) return;
    setHabits(getHabits(userId));
  };

  const handleCreateHabit = (data: NewHabitInput) => {
    if (!userId) return;
    createHabit(userId, data);
    setHabits(getHabits(userId));
    setTab('tab1');
  };

  const queueSnapshot = useSyncExternalStore(
    subscribeAnimationQueue,
    getAnimationQueueSnapshot
  );
  const bootActive =
    queueSnapshot.queue.length > 0 || queueSnapshot.current !== null;
  const skipCurrentBoot = () => skipCurrent();
  const closeAllBoot = () => clearAnimationQueue();

  return (
    <>
      {/* Module 09 (2026-09-26): Electron 自定义紫色 title bar（仅 Electron 环境） */}
      {isElectron && <ElectronTitleBar />}
      {/* Module 09:启动阶段 1 —— 星启页 */}
      {stage === 'splash' && (
        <SplashPage
          isLoggedIn={!!currentUser}
          onEnterApp={currentUser ? handleSplashAutoSkip : handleEnterAuth}
          onAutoSkip={handleSplashAutoSkip}
        />
      )}

      {/* Module 09:启动阶段 2 —— 登录注册页 */}
      {stage === 'auth' && !currentUser && (
        <AuthPage
          key={authResetKey}
          onAuthSuccess={handleAuthSuccess}
          onBackToSplash={() => setStage('splash')}
        />
      )}

      {/* Module 09:启动阶段 3 —— 主界面 */}
      {stage === 'app' && currentUser && (
        <>
          {bootActive ? (
            <BootScreen
              pendingCount={queueSnapshot.queue.length}
              onSkipCurrent={skipCurrentBoot}
              onCloseAll={closeAllBoot}
            />
          ) : (
            <>
              <div className="min-h-screen bg-background">
                <div className="app-shell">
                  {tab === 'tab1' && (
                    <Tab1Content
                      habits={habits}
                      userId={userId}
                      onCheckIn={handleCheckIn}
                    />
                  )}
                  {tab === 'tab2' && (
                    userId ? (
                      <CreateHabitForm
                        onExit={() => setTab('tab1')}
                        onSave={handleCreateHabit}
                      />
                    ) : (
                      <NotLoggedInForm
                        onBack={() => {
                          setExtraProfileView('login');
                          setTab('tab4');
                        }}
                      />
                    )
                  )}
                  {tab === 'tab3' && (
                    <Tab3Statistics habits={habits} currentUserId={userId} />
                  )}
                  {tab === 'tab4' && (
                    <ProfilePage
                      extraView={extraProfileView}
                      onExtraConsumed={() => setExtraProfileView(null)}
                      onLogoutToSplash={handleLogoutToSplash}
                    />
                  )}
                </div>
              </div>

              <BottomTabBar tab={tab} onSwitch={setTab} />
            </>
          )}
        </>
      )}
    </>
  );
}

// ============================================================
// 子组件
// ============================================================

function Tab1Content({
  habits,
  userId,
  onCheckIn,
}: {
  habits: Habit[];
  userId: string;
  onCheckIn: (id: string) => void;
}) {
  const aliveHabits = habits.filter((h) => h.status !== 'deleted');
  const activeHabits = aliveHabits.filter((h) => h.status === 'active');
  const visibleHabits = activeHabits.filter(
    (h) => !hasCheckedInToday(userId, h.id)
  );
  const doneCount = activeHabits.length - visibleHabits.length;
  const totalCount = activeHabits.length;
  const showEmpty = activeHabits.length === 0;
  const showAllDone = !showEmpty && visibleHabits.length === 0;

  // 背景音乐开/关（订阅 store,响应式更新）
  const { playing } = useMusicState();

  return (
    <>
      <main className="px-4 pt-2 pb-24 relative">
        {/* greeting-card：音乐开关按钮 + 标语 + 副文案 */}
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card rounded-[22px] p-5 mb-4 flex items-center gap-3.5 relative overflow-hidden"
          style={{
            boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
          }}
        >
          {/* 装饰柔光（仅音乐开启时显示） */}
          {playing && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -32,
                right: -32,
                width: 120,
                height: 120,
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, rgba(253,219,146,0.40), rgba(255,154,158,0.15))',
                filter: 'blur(20px)',
                pointerEvents: 'none',
              }}
            />
          )}
          {/* 音乐开/关按钮（融合立体感两态） */}
          <button
            type="button"
            onClick={() => toggleMusic()}
            aria-label={playing ? '关闭背景音乐' : '播放背景音乐'}
            aria-pressed={playing}
            className="shrink-0 relative active:scale-95 transition-all duration-200"
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              display: 'grid',
              placeItems: 'center',
              border: playing ? 'none' : '1.5px solid rgba(161, 140, 209, 0.25)',
              background: playing
                ? 'linear-gradient(135deg, #fddb92 0%, #ffab91 100%)'
                : 'rgba(161, 140, 209, 0.10)',
              color: playing ? '#ffffff' : '#9b94a8',
              // 立体感：开 = 凸起多层阴影,关 = 凹陷扁平阴影
              boxShadow: playing
                ? // 外发光 + 内高光 + 内阴影
                  '0 6px 20px rgba(253, 174, 100, 0.55), inset 0 1px 2px rgba(255,255,255,0.7), inset 0 -2px 4px rgba(154, 52, 18, 0.18)'
                : // 扁平凹陷感（按钮没按下）
                  'inset 0 1px 3px rgba(74, 68, 88, 0.10), 0 1px 2px rgba(255,255,255,0.6)',
            }}
          >
            {playing ? (
              <Music className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Music2 className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
            )}
          </button>
          <div className="flex-1 min-w-0 relative">
            <h1
              className="font-stxingkai m-0"
              style={{
                fontSize: '22px',
                color: '#7D7464',
                letterSpacing: '0.05em',
                lineHeight: 1.3,
              }}
            >
              一点一滴 都是未来的自己
            </h1>
            <p className="text-[12px] text-muted mt-1">
              今天的每一个小坚持，都在悄悄改变你 ✨
            </p>
          </div>
        </motion.section>

        {/* date-bar：日期 + 已完成 N/N pill */}
        {!showEmpty && (
          <motion.section
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-between mb-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted font-bold tracking-widest">
                TODAY
              </span>
              <span className="text-[15px] font-extrabold text-foreground">
                {todayCN()}
              </span>
            </div>
            <div
              className="flex items-center gap-2 px-3.5 py-1.5"
              style={{
                background: '#ffffff',
                borderRadius: '999px',
                boxShadow: '0 2px 8px rgba(161, 140, 209, 0.10)',
                fontSize: '12px',
                fontWeight: 700,
                color: '#a18cd1',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#84fab0',
                  boxShadow: '0 0 8px #84fab0',
                }}
                aria-hidden="true"
              />
              <span>
                已完成 {doneCount}/{totalCount}
              </span>
            </div>
          </motion.section>
        )}

        {/* 习惯卡片列表 */}
        <section className="space-y-3">
          <AnimatePresence mode="popLayout">
            {visibleHabits.map((h, i) => (
              <HabitCard
                key={h.id}
                habit={h}
                onCheckIn={onCheckIn}
                index={i}
              />
            ))}
          </AnimatePresence>
        </section>
      </main>

      {showAllDone && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-card rounded-[22px] mx-4 p-10 text-center"
          style={{
            boxShadow: '0 4px 16px rgba(161, 140, 209, 0.12)',
          }}
        >
          <div className="text-[36px] mb-3" aria-hidden="true">
            ✨
          </div>
          <p className="text-[16px] text-foreground font-bold">
            今日全部打卡完成
          </p>
          <p className="text-[13px] text-muted mt-2">
            明天再来保持节奏
          </p>
        </motion.div>
      )}

      {showEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-card rounded-[22px] mx-4 p-10 text-center"
          style={{
            boxShadow: '0 4px 16px rgba(161, 140, 209, 0.12)',
          }}
        >
          <div className="text-[36px] mb-3" aria-hidden="true">
            🌱
          </div>
          <p className="text-[15px] text-foreground font-bold">还没有习惯</p>
          <p className="text-[13px] text-muted mt-2">
            点底栏中间的 <span className="text-primary font-bold">+</span> 创建第一个
          </p>
        </motion.div>
      )}
    </>
  );
}

function BottomTabBar({
  tab,
  onSwitch,
}: {
  tab: TabKey;
  onSwitch: (t: TabKey) => void;
}) {
  return (
    <nav className="bottom-tab-bar" role="tablist" aria-label="主导航">
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            onClick={() => onSwitch(key)}
            className={`bottom-tab-bar__btn ${
              active
                ? 'bottom-tab-bar__btn--active'
                : 'bottom-tab-bar__btn--inactive'
            }`}
          >
            <Icon
              className="w-5 h-5"
              strokeWidth={active ? 2.5 : 2}
              aria-hidden="true"
            />
            <span className="bottom-tab-bar__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default App;

function NotLoggedInForm({ onBack }: { onBack: () => void }) {
  return (
    <>
      <header className="form-top-bar">
        <button
          type="button"
          onClick={onBack}
          className="form-top-bar__btn form-top-bar__btn--exit"
        >
          ‹ 返回
        </button>
        <h1 className="form-top-bar__title">新建习惯</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>
      <main className="px-4 py-6">
        <div className="bg-card rounded-2xl p-6 text-center">
          <div className="text-[15px] text-foreground font-medium mb-2">
            需要先登录
          </div>
          <p className="text-[13px] text-muted mb-4">
            创建习惯需要登录账号（习惯数据按账号隔离）
          </p>
          <button
            type="button"
            onClick={onBack}
            className="h-10 px-5 bg-primary text-white rounded-xl font-medium text-[14px] active:scale-[0.98] transition-transform"
          >
            返回个人中心登录
          </button>
        </div>
      </main>
    </>
  );
}