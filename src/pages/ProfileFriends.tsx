import { useState, useCallback } from 'react';
import { UserPlus, Check, X, Trash2 } from 'lucide-react';
import { FormField } from '../components/FormField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getCurrentUser, findUserById } from '../store/authStore';
import {
  getFriendships,
  getPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriendship,
  type Friendship,
  type FriendRequest,
} from '../store/friendStore';
import { findMockCandidate } from '../data/mockCandidates';
import { COLOR_HEX } from '../utils/colors';
import type { HabitColor } from '../types/habit';
import { relativeTimeCN } from '../utils/relativeTime';

interface ProfileFriendsProps {
  onBack: () => void;
}

/**
 * 子页：好友系统
 * spec §4.4：
 * - 发起申请：输入对方 ID
 * - 收到申请：列表 + 接受 / 拒绝
 * - 好友关系：用于 Tab 3 排行榜
 *
 * UI 结构（自上而下）：
 * 1. 添加好友表单
 * 2. 收到的申请（待处理）
 * 3. 我的好友
 * 4. mock 池提示（底部，方便测试）
 */
export function ProfileFriends({ onBack }: ProfileFriendsProps) {
  const currentUser = getCurrentUser();

  // 必须登录才能进入
  if (!currentUser) {
    return (
      <NotLoggedInView onBack={onBack} />
    );
  }

  // 已登录：渲染主内容
  return <FriendsView userId={currentUser.id} onBack={onBack} />;
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
        <h1 className="form-top-bar__title">好友</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>
      <main className="px-4 py-6">
        <div className="text-center text-muted text-[14px] py-12">
          <div className="text-[15px] text-foreground font-medium mb-2">
            需要先登录
          </div>
          <div>好友系统需要先注册或登录账号</div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
 * 已登录态主内容
 * ========================================================== */
function FriendsView({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const [friendships, setFriendships] = useState<Friendship[]>(() =>
    getFriendships(userId)
  );
  const [requests, setRequests] = useState<FriendRequest[]>(() =>
    getPendingRequests(userId)
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [pendingUnfriend, setPendingUnfriend] = useState<Friendship | null>(
    null,
  );

  const refresh = useCallback(() => {
    setFriendships(getFriendships(userId));
    setRequests(getPendingRequests(userId));
  }, [userId]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 2500);
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
        <h1 className="form-top-bar__title">好友</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>

      <main className="px-4 pt-4 pb-24 space-y-5">
        {/* 顶部反馈条 */}
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

        {/* 1. 添加好友 */}
        <AddFriendForm
          onSuccess={(msg) => {
            refresh();
            showFeedback('success', msg);
          }}
        />

        {/* 2. 收到的申请 */}
        {requests.length > 0 && (
          <RequestsSection
            requests={requests}
            onAccept={(reqId) => {
              acceptFriendRequest(reqId);
              refresh();
              showFeedback('success', '已接受好友申请');
            }}
            onReject={(reqId) => {
              rejectFriendRequest(reqId);
              refresh();
              showFeedback('success', '已拒绝');
            }}
          />
        )}

        {/* 3. 我的好友 */}
        <FriendsSection
          friendships={friendships}
          onRemove={(friendId) => {
            const target = friendships.find((f) => f.friendId === friendId);
            if (target) {
              setPendingUnfriend(target);
            }
          }}
        />
      </main>

      {/* 解除好友确认弹窗（自定义 ConfirmDialog,替代 native confirm） */}
      <ConfirmDialog
        open={!!pendingUnfriend}
        variant="unfriend"
        title="确定要解除好友关系吗？"
        highlight={pendingUnfriend?.friendNickname}
        description=""
        cancelText="再想想"
        confirmText="解除好友"
        onCancel={() => setPendingUnfriend(null)}
        onConfirm={() => {
          if (pendingUnfriend) {
            removeFriendship(userId, pendingUnfriend.friendId);
            refresh();
            showFeedback('success', '已解除好友关系');
          }
          setPendingUnfriend(null);
        }}
      />
    </>
  );
}

/* ============================================================
 * 1. 添加好友表单
 * ========================================================== */
function AddFriendForm({
  onSuccess,
}: {
  onSuccess: (msg: string) => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  if (!currentUser) return null;

  const handleSubmit = () => {
    const trimmed = targetId.trim();
    if (!trimmed) {
      setError('请输入对方 ID');
      return;
    }

    // 查找对方（先查用户表，再查 mock 候选池）
    let targetUser = findUserById(trimmed);
    if (!targetUser) {
      const candidate = findMockCandidate(trimmed);
      if (candidate) {
        // mock 候选池没有 passwordHash/salt，构造 CurrentUser 时填占位空串
        targetUser = {
          id: candidate.id,
          nickname: candidate.nickname,
          createdAt: 0,
          passwordHash: '',
          passwordSalt: '',
        };
      }
    }

    if (!targetUser) {
      setError('该 ID 不存在（请检查是否输错，或让对方先注册）');
      return;
    }

    const foundNickname = targetUser.nickname;

    const result = sendFriendRequest(
      currentUser.id,
      currentUser.nickname,
      targetUser.id
    );

    if (!result.ok) {
      const reasonMap = {
        self: '不能加自己为好友',
        already_friend: '你们已经是好友了',
        already_requested: '已经发过申请了，等待对方处理',
      };
      setError(reasonMap[result.reason!] ?? '发起申请失败');
      return;
    }

    setTargetId('');
    setError(null);
    onSuccess(`已向 ${foundNickname} 发送好友申请`);
  };

  return (
    <section className="bg-card rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus
          className="w-4 h-4 text-primary"
          aria-hidden="true"
        />
        <h2 className="text-[15px] font-semibold text-foreground">
          添加好友
        </h2>
      </div>
      <FormField label="对方唯一 ID" error={error ?? undefined}>
        <input
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            if (error) setError(null);
          }}
          maxLength={64}
          placeholder="例如: L!3aZ9bN?x"
          className={`w-full h-11 px-3 bg-stone-50 border rounded-xl text-[14px] font-mono outline-none transition-colors ${
            error
              ? 'border-stone-500 focus:border-foreground'
              : 'border-border focus:border-primary'
          }`}
        />
      </FormField>
      <button
        type="button"
        onClick={handleSubmit}
        className="btn-gradient w-full h-11 mt-3 text-[14px] font-bold"
      >
        发送好友申请
      </button>
    </section>
  );
}

/* ============================================================
 * 2. 收到的申请
 * ========================================================== */
function RequestsSection({
  requests,
  onAccept,
  onReject,
}: {
  requests: FriendRequest[];
  onAccept: (reqId: string) => void;
  onReject: (reqId: string) => void;
}) {
  return (
    <section className="bg-card rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[15px] font-semibold text-foreground">
          收到的申请
        </h2>
        <span className="text-[11px] text-muted bg-stone-100 px-1.5 py-0.5 rounded">
          {requests.length}
        </span>
      </div>
      <ul className="space-y-2">
        {requests.map((req) => {
          const candidate = findMockCandidate(req.fromUserId);
          const color: HabitColor = candidate?.color ?? 'slate';
          return (
            <li
              key={req.id}
              className="flex items-center gap-3 px-3 py-2.5 bg-stone-50 rounded-lg"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
                style={{ backgroundColor: COLOR_HEX[color] }}
                aria-hidden="true"
              >
                {req.fromUserNickname.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-foreground truncate">
                  {req.fromUserNickname}
                </div>
                <div className="text-[11px] text-muted">
                  想加你为好友 · {relativeTimeCN(req.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAccept(req.id)}
                aria-label={`接受 ${req.fromUserNickname} 的申请`}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center active:scale-95 transition-transform shrink-0"
              >
                <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onReject(req.id)}
                aria-label={`拒绝 ${req.fromUserNickname} 的申请`}
                className="w-8 h-8 rounded-full bg-stone-200 text-foreground flex items-center justify-center active:scale-95 transition-transform shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================
 * 3. 我的好友
 * ========================================================== */
function FriendsSection({
  friendships,
  onRemove,
}: {
  friendships: Friendship[];
  onRemove: (friendId: string) => void;
}) {
  return (
    <section className="bg-card rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[15px] font-semibold text-foreground">我的好友</h2>
        <span className="text-[11px] text-muted bg-stone-100 px-1.5 py-0.5 rounded">
          {friendships.length}
        </span>
      </div>
      {friendships.length === 0 ? (
        <div className="text-center text-muted text-[13px] py-6">
          还没有好友。在上方输入对方的唯一 ID 添加
        </div>
      ) : (
        <ul className="space-y-2">
          {friendships.map((f) => {
            const candidate = findMockCandidate(f.friendId);
            const color: HabitColor =
              (f.friendColor as HabitColor | undefined) ??
              candidate?.color ??
              'slate';
            return (
              <li
                key={f.friendId}
                className="flex items-center gap-3 px-3 py-2.5 bg-stone-50 rounded-lg"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
                  style={{ backgroundColor: COLOR_HEX[color] }}
                  aria-hidden="true"
                >
                  {f.friendNickname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-foreground truncate">
                    {f.friendNickname}
                  </div>
                  <div className="text-[11px] text-muted font-mono truncate">
                    {f.friendId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(f.friendId)}
                  aria-label={`删除好友 ${f.friendNickname}`}
                  className="w-8 h-8 rounded-full bg-stone-200 text-muted flex items-center justify-center active:scale-95 transition-transform shrink-0"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}