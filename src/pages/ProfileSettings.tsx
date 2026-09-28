import { useState, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Edit3,
  Trash2,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  getCurrentUser,
  updateNickname,
  updatePassword,
  type CurrentUser,
} from '../store/authStore';
import {
  getHabits,
  deleteHabit,
  restoreHabit,
  getDeletedHabits,
  purgeHabit,
} from '../store/habitStore';
import type { Habit } from '../types/habit';
import { COLOR_HEX } from '../utils/colors';
import type { HabitColor } from '../types/habit';

interface ProfileSettingsProps {
  onBack: () => void;
  onUserChange: (user: CurrentUser | null) => void;
}

/**
 * 设置子页（spec §4.5）：
 * - 退出登录
 * - 修改昵称 / 修改密码
 * - 删除习惯 → 努力值 = 0
 * - 恢复已删除习惯 → 重新按公式计算（已到期不能恢复）
 */
export function ProfileSettings({
  onBack,
  onUserChange,
}: ProfileSettingsProps) {
  const user = getCurrentUser();

  if (!user) {
    return <NotLoggedInView onBack={onBack} />;
  }

  return (
    <SettingsView
      user={user}
      onBack={onBack}
      onUserChange={onUserChange}
    />
  );
}

/* ============================================================
 * 未登录态
 * ========================================================== */
function NotLoggedInView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <header className="form-top-bar">
        <button
          type="button"
          onClick={onBack}
          className="form-top-bar__btn form-top-bar__btn--exit"
          aria-label="返回个人中心"
        >
          ‹ 返回
        </button>
        <h1 className="form-top-bar__title">设置</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>
      <main className="px-4 py-6">
        <div className="text-center text-muted text-[14px] py-12">
          <div className="text-[15px] text-foreground font-medium mb-2">
            需要先登录
          </div>
          <div>设置功能需要先注册或登录账号</div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
 * 已登录态主内容
 * ========================================================== */
function SettingsView({
  user,
  onBack,
  onUserChange,
}: {
  user: CurrentUser;
  onBack: () => void;
  onUserChange: (user: CurrentUser | null) => void;
}) {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(user);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const [activeHabits, setActiveHabits] = useState<Habit[]>(() =>
    getHabits(user.id).filter((h) => h.status === 'active')
  );
  const [deletedHabits, setDeletedHabits] = useState<Habit[]>(() =>
    getDeletedHabits(user.id)
  );

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 2500);
  };

  const refreshHabits = useCallback(() => {
    setActiveHabits(getHabits(user.id).filter((h) => h.status === 'active'));
    setDeletedHabits(getDeletedHabits(user.id));
  }, [user.id]);

  const handleUserUpdate = (updated: CurrentUser) => {
    setCurrentUser(updated);
    onUserChange(updated);
  };

  return (
    <>
      <header className="form-top-bar">
        <button
          type="button"
          onClick={onBack}
          className="form-top-bar__btn form-top-bar__btn--exit"
          aria-label="返回个人中心"
        >
          ‹ 返回
        </button>
        <h1 className="form-top-bar__title">设置</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>

      <main className="px-4 pt-4 pb-24 space-y-5">
        {/* 反馈条 */}
        {feedback && (
          <div
            className={`px-3 py-2 rounded-lg text-[13px] ${
              feedback.type === 'success'
                ? 'bg-primary/10 text-primary'
                : 'bg-stone-100 text-foreground'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* 1. 账号信息 */}
        <AccountInfoCard user={currentUser} />

        {/* 2. 修改昵称 */}
        <UpdateNicknameForm
          currentUser={currentUser}
          onSuccess={(u, msg) => {
            handleUserUpdate(u);
            showFeedback('success', msg);
          }}
        />

        {/* 3. 修改密码 */}
        <UpdatePasswordForm
          currentUser={currentUser}
          onSuccess={(u, msg) => {
            handleUserUpdate(u);
            showFeedback('success', msg);
          }}
        />

        {/* 4. 删除习惯 */}
        <DeleteHabitSection
          habits={activeHabits}
          onDelete={(id, name) => {
            deleteHabit(currentUser.id, id);
            refreshHabits();
            showFeedback('success', `已删除「${name}」`);
          }}
        />

        {/* 5. 恢复已删除习惯 */}
        <RestoreHabitSection
          habits={deletedHabits}
          onRestore={(id, name) => {
            const result = restoreHabit(currentUser.id, id);
            if (!result) {
              showFeedback('error', `「${name}」已到期，无法恢复`);
              return;
            }
            refreshHabits();
            showFeedback('success', `已恢复「${name}」`);
          }}
          onPurge={(id, name) => {
            const ok = purgeHabit(currentUser.id, id);
            if (!ok) {
              showFeedback('error', `永久删除失败`);
              return;
            }
            refreshHabits();
            showFeedback('success', `已永久删除「${name}」`);
          }}
        />
      </main>
    </>
  );
}

/* ============================================================
 * 1. 账号信息卡
 * ========================================================== */
function AccountInfoCard({ user }: { user: CurrentUser }) {
  return (
    <section
      className="bg-card rounded-[22px] p-5"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <SettingsIcon className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-foreground truncate">
            {user.nickname}
          </div>
          <div className="text-[11px] text-muted font-mono truncate">
            {user.id}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
 * 2. 修改昵称
 * ========================================================== */
function UpdateNicknameForm({
  currentUser,
  onSuccess,
}: {
  currentUser: CurrentUser;
  onSuccess: (user: CurrentUser, msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newNickname, setNewNickname] = useState(currentUser.nickname);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = () => {
    setBusy(true);
    const result = updateNickname(currentUser, newNickname);
    setBusy(false);

    if (!result.ok) {
      const msgMap = {
        empty: '请输入新昵称',
        too_long: '昵称不超过 20 字符',
        nickname_taken: '这个昵称已被占用',
        no_change: '新昵称和当前相同',
      };
      setError(msgMap[result.reason]);
      return;
    }

    setError(null);
    setEditing(false);
    onSuccess(result.user, '昵称已更新');
  };

  if (!editing) {
    return (
      <section
      className="bg-card rounded-[22px] p-5"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-stone-100 text-muted flex items-center justify-center shrink-0">
            <Edit3 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[14px] font-medium text-foreground">
              修改昵称
            </div>
            <div className="text-[12px] text-muted">当前：{currentUser.nickname}</div>
          </div>
        </button>
      </section>
    );
  }

  return (
    <section
      className="bg-card rounded-[22px] p-5 space-y-3"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
      <div className="text-[14px] font-medium text-foreground">修改昵称</div>
      <input
        value={newNickname}
        onChange={(e) => {
          setNewNickname(e.target.value);
          if (error) setError(null);
        }}
        maxLength={20}
        placeholder="新昵称"
        style={{ paddingLeft: '12px', paddingRight: '12px' }}
        className={`w-full h-11 bg-stone-50 border rounded-xl text-[14px] outline-none transition-colors ${
          error
            ? 'border-stone-500 focus:border-foreground'
            : 'border-border focus:border-primary'
        }`}
      />
      {error && (
        <p className="text-[12px] text-foreground">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="flex-1 h-10 bg-primary text-white rounded-xl font-medium text-[14px] active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-1"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          保存
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
            setNewNickname(currentUser.nickname);
          }}
          className="flex-1 h-10 bg-card rounded-xl font-medium text-[14px] text-foreground hover:bg-stone-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-1"
        >
          <X className="w-4 h-4" aria-hidden="true" />
          取消
        </button>
      </div>
    </section>
  );
}

/* ============================================================
 * 3. 修改密码
 * ========================================================== */
function UpdatePasswordForm({
  currentUser,
  onSuccess,
}: {
  currentUser: CurrentUser;
  onSuccess: (user: CurrentUser, msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmNew('');
    setError(null);
  };

  const handleSave = async () => {
    if (busy) return;
    setError(null);

    // 同步收集错误
    const errors = {
      old: null as string | null,
      new: null as string | null,
      confirm: null as string | null,
    };
    if (!oldPassword) errors.old = '请输入旧密码';
    if (!newPassword) errors.new = '请输入新密码';
    else if (newPassword.length < 6) errors.new = '新密码至少 6 位';
    if (!confirmNew) errors.confirm = '请再次输入新密码';
    else if (newPassword && newPassword !== confirmNew) {
      errors.confirm = '两次输入的新密码不一致';
    }

    if (errors.old || errors.new || errors.confirm) {
      // 合并到一个错误消息（密码框相对短，UI 上用一个提示即可）
      const msg = [errors.old, errors.new, errors.confirm]
        .filter(Boolean)
        .join('；');
      setError(msg);
      return;
    }

    setBusy(true);
    const result = await updatePassword(currentUser, oldPassword, newPassword);
    setBusy(false);

    if (!result.ok) {
      const msgMap = {
        empty: '请填写完整',
        wrong_old: '旧密码错误',
        weak_password: '新密码至少 6 位，且需包含字母、数字、特殊符号',
        same_as_old: '新密码和旧密码相同',
      };
      setError(msgMap[result.reason]);
      return;
    }

    reset();
    setEditing(false);
    onSuccess(result.user, '密码已更新');
  };

  if (!editing) {
    return (
      <section
      className="bg-card rounded-[22px] p-5"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-stone-100 text-muted flex items-center justify-center shrink-0">
            <Edit3 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[14px] font-medium text-foreground">
              修改密码
            </div>
            <div className="text-[12px] text-muted">需要输入旧密码验证</div>
          </div>
        </button>
      </section>
    );
  }

  return (
    <section
      className="bg-card rounded-[22px] p-5 space-y-3"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
      <div className="text-[14px] font-medium text-foreground">修改密码</div>

      <input
        type="password"
        value={oldPassword}
        onChange={(e) => {
          setOldPassword(e.target.value);
          if (error) setError(null);
        }}
        maxLength={64}
        placeholder="旧密码"
        autoComplete="current-password"
        style={{ paddingLeft: '12px', paddingRight: '12px' }}
        className="w-full h-11 bg-stone-50 border border-border rounded-xl text-[14px] outline-none focus:border-primary transition-colors"
      />

      <input
        type="password"
        value={newPassword}
        onChange={(e) => {
          setNewPassword(e.target.value);
          if (error) setError(null);
        }}
        maxLength={64}
        placeholder="新密码（至少 6 位，含字母+数字+特殊符号）"
        autoComplete="new-password"
        style={{ paddingLeft: '12px', paddingRight: '12px' }}
        className="w-full h-11 bg-stone-50 border border-border rounded-xl text-[14px] outline-none focus:border-primary transition-colors"
      />

      <input
        type="password"
        value={confirmNew}
        onChange={(e) => {
          setConfirmNew(e.target.value);
          if (error) setError(null);
        }}
        maxLength={64}
        placeholder="再次输入新密码"
        autoComplete="new-password"
        style={{ paddingLeft: '12px', paddingRight: '12px' }}
        className="w-full h-11 bg-stone-50 border border-border rounded-xl text-[14px] outline-none focus:border-primary transition-colors"
      />

      {error && (
        <p className="text-[12px] text-foreground">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="flex-1 h-10 bg-primary text-white rounded-xl font-medium text-[14px] active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-1"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          {busy ? '保存中...' : '保存'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            reset();
          }}
          className="flex-1 h-10 bg-card rounded-xl font-medium text-[14px] text-foreground hover:bg-stone-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-1"
        >
          <X className="w-4 h-4" aria-hidden="true" />
          取消
        </button>
      </div>
    </section>
  );
}

/* ============================================================
 * 4. 删除习惯
 * ========================================================== */
function DeleteHabitSection({
  habits,
  onDelete,
}: {
  habits: Habit[];
  onDelete: (id: string, name: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<Habit | null>(null);

  return (
    <section
      className="bg-card rounded-[22px] p-5"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[15px] font-semibold text-foreground">删除习惯</h2>
        <span className="text-[11px] text-muted bg-stone-100 px-1.5 py-0.5 rounded">
          {habits.length}
        </span>
      </div>
      <p className="text-[12px] text-muted mb-3">
        删除后该习惯的努力值会清零，可在下方"恢复已删除习惯"找回
      </p>
      {habits.length === 0 ? (
        <div className="text-center text-muted text-[13px] py-4">
          暂无活跃习惯
        </div>
      ) : (
        <ul className="space-y-2">
          {habits.map((h) => (
            <HabitListItem
              key={h.id}
              habit={h}
              actionIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
              actionLabel={`删除 ${h.name}`}
              actionClass="bg-stone-200 text-muted"
              onAction={() => setPendingDelete(h)}
            />
          ))}
        </ul>
      )}

      {/* 删除确认弹窗（梦幻毛玻璃） */}
      <ConfirmDialog
        open={!!pendingDelete}
        variant="danger"
        title="确定要删除这个习惯吗？"
        highlight={pendingDelete?.name}
        description="删除后努力值会清零，可在下方「恢复已删除习惯」中找回。"
        cancelText="再想想"
        confirmText="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id, pendingDelete.name);
          setPendingDelete(null);
        }}
      />
    </section>
  );
}

/* ============================================================
 * 6. 恢复已删除习惯
 * ========================================================== */
function RestoreHabitSection({
  habits,
  onRestore,
  onPurge,
}: {
  habits: Habit[];
  onRestore: (id: string, name: string) => void;
  onPurge: (id: string, name: string) => void;
}) {
  const [pendingRestore, setPendingRestore] = useState<Habit | null>(null);
  const [pendingPurge, setPendingPurge] = useState<Habit | null>(null);

  return (
    <section
      className="bg-card rounded-[22px] p-5"
      style={{
        boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[15px] font-semibold text-foreground">
          恢复已删除习惯
        </h2>
        <span className="text-[11px] text-muted bg-stone-100 px-1.5 py-0.5 rounded">
          {habits.length}
        </span>
      </div>
      <p className="text-[12px] text-muted mb-3">
        已到期的习惯无法恢复（endDate 早于今天）；永久删除后不可恢复
      </p>
      {habits.length === 0 ? (
        <div className="text-center text-muted text-[13px] py-4">
          没有可恢复的习惯
        </div>
      ) : (
        <ul className="space-y-2">
          {habits.map((h) => (
            <HabitListItem
              key={h.id}
              habit={h}
              actionIcon={
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              }
              actionLabel={`恢复 ${h.name}`}
              actionClass="bg-primary text-white"
              onAction={() => setPendingRestore(h)}
              secondaryAction={{
                icon: (
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                ),
                label: `永久删除 ${h.name}`,
                className: 'bg-stone-200 text-stone-700 hover:bg-stone-300',
                onClick: () => setPendingPurge(h),
              }}
            />
          ))}
        </ul>
      )}

      {/* 恢复确认弹窗（薄荷绿渐变） */}
      <ConfirmDialog
        open={!!pendingRestore}
        variant="restore"
        title="确定要恢复这个习惯吗？"
        highlight={pendingRestore?.name}
        description="恢复后会重新按公式计算努力值。"
        cancelText="再想想"
        confirmText="恢复"
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          if (pendingRestore) onRestore(pendingRestore.id, pendingRestore.name);
          setPendingRestore(null);
        }}
      />

      {/* 永久删除确认弹窗（粉红渐变,不可撤销） */}
      <ConfirmDialog
        open={!!pendingPurge}
        variant="danger"
        title="确定要永久删除吗？"
        highlight={pendingPurge?.name}
        description="此操作不可撤销，请谨慎操作。"
        cancelText="再想想"
        confirmText="永久删除"
        onCancel={() => setPendingPurge(null)}
        onConfirm={() => {
          if (pendingPurge) onPurge(pendingPurge.id, pendingPurge.name);
          setPendingPurge(null);
        }}
      />
    </section>
  );
}

/* ============================================================
 * 通用：习惯列表项
 * ========================================================== */
function HabitListItem({
  habit,
  actionIcon,
  actionLabel,
  actionClass,
  onAction,
  secondaryAction,
}: {
  habit: Habit;
  actionIcon: React.ReactNode;
  actionLabel: string;
  actionClass: string;
  onAction: () => void;
  /** 可选的第二个按钮（彻底删除等） */
  secondaryAction?: {
    icon: React.ReactNode;
    label: string;
    className: string;
    onClick: () => void;
  };
}) {
  const color: HabitColor = habit.color ?? 'slate';
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 bg-stone-50 rounded-lg">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
        style={{ backgroundColor: COLOR_HEX[color] }}
        aria-hidden="true"
      >
        {habit.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-foreground truncate">
          {habit.name}
        </div>
        <div className="text-[11px] text-muted">
          {habit.totalDays}天计划 · 已坚持 {habit.checkInCount} 天
        </div>
      </div>
      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          aria-label={secondaryAction.label}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform ${secondaryAction.className}`}
        >
          {secondaryAction.icon}
        </button>
      )}
      <button
        type="button"
        onClick={onAction}
        aria-label={actionLabel}
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform ${actionClass}`}
      >
        {actionIcon}
      </button>
    </li>
  );
}

/* ============================================================
 * 立即测试推送（Phase 4）
 * - 已移除（Module 09 后端定时备份已接管推送 + 数据安全）
 * ========================================================== */