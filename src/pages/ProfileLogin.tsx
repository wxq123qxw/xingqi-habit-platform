import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Copy, Check, LogOut, Eye, EyeOff } from 'lucide-react';
import { FormField } from '../components/FormField';
import {
  getCurrentUser,
  logout,
  registerUserWithPassword,
  loginByCredentials,
  isValidPassword,
  type CurrentUser,
} from '../store/authStore';

/**
 * 过滤掉非 ASCII 字符和空格，只保留 ASCII 可打印字符（不含空格）。
 * 保留范围：0x21–0x7E（! 到 ~），包含：
 * - 字母 a-zA-Z、数字 0-9
 * - 所有 ASCII 可打印标点（32 个）：!-/:-@\[-`\{-~ 等
 * - 排除：空格 (0x20)、DEL (0x7F)、所有中文/全角/emoji
 *
 * 实际"特殊符号"识别见 authStore.ts 的 SPECIAL_REGEX，覆盖 32 字符全集。
 */
function asciiOnly(value: string): string {
  return value.replace(/[^\x21-\x7E]/g, '');
}

interface ProfileLoginProps {
  onBack: () => void;
  onUserChange: (user: CurrentUser | null) => void;
}

type Mode = 'register' | 'login';

/**
 * 子页：注册 / 登录
 *
 * 设计：
 * - 注册：填昵称 + 密码 + 确认密码 → 自动生成唯一 ID（公开标识，用于加好友）
 * - 登录：用昵称 + 密码登录（密码是私有凭证）
 * - ID 是公开可见的、用来加好友；密码只有本人知道
 *
 * 校验规则：
 * - 三个字段独立 error state，提交时统一收集所有错误再一次性展示
 * - 哪个字段错，错误就显示在哪个字段下方（不串位）
 *
 * spec §4.3 注册流程：填写信息 → 后端生成唯一 ID 返回给客户端
 */
export function ProfileLogin({ onBack, onUserChange }: ProfileLoginProps) {
  const existing = getCurrentUser();

  if (existing) {
    return (
      <LoggedInView
        user={existing}
        onBack={onBack}
        onLogout={() => {
          logout();
          onUserChange(null);
        }}
      />
    );
  }

  return <AuthView onBack={onBack} onUserChange={onUserChange} />;
}

/* ============================================================
 * 已登录态
 * ========================================================== */
function LoggedInView({
  user,
  onBack,
  onLogout,
}: {
  user: CurrentUser;
  onBack: () => void;
  onLogout: () => void;
}) {
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
        <h1 className="form-top-bar__title">我的账号</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>

      <main className="px-4 py-6 space-y-4">
        {/* 账号信息卡（圆角 22 + 渐变头像 + 柔和阴影） */}
        <section
          className="bg-card rounded-[22px] p-5 relative overflow-hidden"
          style={{
            boxShadow: '0 4px 16px rgba(161, 140, 209, 0.10)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 120,
              height: 120,
              borderRadius: '50%',
              background:
                'linear-gradient(135deg, rgba(161,140,209,0.18), rgba(251,194,235,0.10))',
              filter: 'blur(20px)',
              pointerEvents: 'none',
            }}
          />
          {/* 头像 + 昵称 */}
          <div className="flex items-center gap-3 relative">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-[20px] font-extrabold shrink-0"
              style={{
                background:
                  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
                boxShadow: '0 4px 14px rgba(161, 140, 209, 0.35)',
              }}
            >
              {user.nickname.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted font-bold tracking-widest mb-1">
                昵称
              </div>
              <div className="text-[18px] font-extrabold text-foreground truncate">
                {user.nickname}
              </div>
            </div>
          </div>

          {/* ID 区域 */}
          <div className="mt-5 relative">
            <div className="text-[11px] text-muted font-bold tracking-widest mb-2">
              我的唯一 ID（加好友时把这个给对方）
            </div>
            <IdDisplay id={user.id} />
          </div>

          <div className="mt-5 text-[11px] text-muted leading-relaxed relative">
            注册时间：
            {new Date(user.createdAt).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </section>

        {/* 退出登录卡（渐变按钮） */}
        <button
          type="button"
          onClick={onLogout}
          className="btn-gradient w-full h-11 text-[14px] font-bold flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          退出登录
        </button>
      </main>
    </>
  );
}

/* ============================================================
 * 未登录态：注册 / 登录 双 tab
 * ========================================================== */
function AuthView({
  onBack,
  onUserChange,
}: {
  onBack: () => void;
  onUserChange: (user: CurrentUser | null) => void;
}) {
  const [mode, setMode] = useState<Mode>('register');
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
        <h1 className="form-top-bar__title">注册 / 登录</h1>
        <span className="w-[60px]" aria-hidden="true" />
      </header>

      <main className="px-4 pt-4 pb-6">
        <div className="flex bg-card rounded-xl p-1 mb-5">
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 h-9 text-[14px] font-medium rounded-lg transition-colors ${
              mode === 'register'
                ? 'bg-primary text-white'
                : 'text-muted'
            }`}
          >
            注册新账号
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 h-9 text-[14px] font-medium rounded-lg transition-colors ${
              mode === 'login' ? 'bg-primary text-white' : 'text-muted'
            }`}
          >
            登录
          </button>
        </div>

        {mode === 'register' ? (
          <RegisterForm onSuccess={onUserChange} />
        ) : (
          <LoginForm onSuccess={onUserChange} />
        )}
      </main>
    </>
  );
}

/* ============================================================
 * 注册表单：昵称 + 密码 + 确认密码（三个独立 error）
 * ========================================================== */
function RegisterForm({
  onSuccess,
}: {
  onSuccess: (user: CurrentUser) => void;
}) {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<CurrentUser | null>(null);

  // Module 07 (2026-09-26)：Electron 内退出登录后重新登录，input 偶尔无法 focus。
  // 用 useRef + useLayoutEffect 兜底
  // 【重要】不能再用 ref callback + 内部 node.focus() —— React 18 每次 render 都会
  //   重新调 ref callback（先传 null 再传 node），会把焦点抢回 nickname 输入框，
  //   导致"在密码框输入一个字符后光标跳回昵称"。
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    if (nicknameRef.current) {
      nicknameRef.current.focus();
    }
  }, []);

  const clearErrors = () => {
    setNicknameError(null);
    setPasswordError(null);
    setConfirmError(null);
  };

  const handleSubmit = async () => {
    if (busy) return;
    clearErrors();

    // 同步收集所有字段错误（不短路）
    const errors: {
      nickname: string | null;
      password: string | null;
      confirm: string | null;
    } = { nickname: null, password: null, confirm: null };

    if (!nickname.trim()) {
      errors.nickname = '请输入昵称';
    } else if (nickname.trim().length > 20) {
      errors.nickname = '昵称不超过 20 字符';
    }

    if (!password) {
      errors.password = '请输入密码';
    } else if (!isValidPassword(password)) {
      errors.password = '密码至少 6 位，且需同时包含字母、数字、特殊符号';
    }

    if (!confirmPassword) {
      errors.confirm = '请再次输入密码';
    } else if (password !== confirmPassword) {
      errors.confirm = '两次输入的密码不一致';
    }

    if (errors.nickname || errors.password || errors.confirm) {
      setNicknameError(errors.nickname);
      setPasswordError(errors.password);
      setConfirmError(errors.confirm);
      return;
    }

    // 字段都过 → 调接口
    setBusy(true);
    const result = await registerUserWithPassword({ nickname, password });
    setBusy(false);

    if (!result.ok) {
      if (result.reason === 'nickname_taken') {
        setNicknameError('这个昵称已被占用');
        return;
      }
      setNicknameError('注册失败，请重试');
      return;
    }

    setGenerated(result.user);
    onSuccess(result.user);
  };

  if (generated) {
    return (
      <div className="bg-card rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <div className="text-[12px] text-muted mb-1">昵称</div>
          <div className="text-[16px] font-medium text-foreground">
            {generated.nickname}
          </div>
        </div>
        <div>
          <div className="text-[12px] text-muted mb-1">
            你的唯一 ID（加好友时把这个给对方，密码别告诉别人）
          </div>
          <IdDisplay id={generated.id} />
        </div>
        <div className="text-[12px] text-muted leading-relaxed">
          ✅ 注册成功。下次直接用昵称 + 密码登录即可。
        </div>
      </div>
    );
  }

  return (
    <>
      <FormField label="昵称" error={nicknameError ?? undefined}>
        <input
          ref={nicknameRef}
          autoFocus
          tabIndex={0}
          spellCheck={false}
          autoComplete="off"
          value={nickname}
          onChange={(e) => {
            // 过滤掉空格（不允许空格出现在昵称中）
            const filtered = e.target.value.replace(/\s/g, '');
            setNickname(filtered);
            if (nicknameError) setNicknameError(null);
          }}
          onMouseDown={(e) => {
            // Electron 内偶尔点 input 不触发 focus，主动触发
            if (e.currentTarget !== document.activeElement) {
              e.preventDefault();
              e.currentTarget.focus();
            }
          }}
          maxLength={20}
          placeholder="20 字以内（不含空格）"
          style={{ paddingLeft: '12px', paddingRight: '12px' }}
          className="w-full h-11 bg-card border border-border rounded-xl text-[14px] outline-none focus:border-primary transition-colors"
        />
      </FormField>

      <FormField
        label="密码（至少 6 位，且包括字母、数字和特殊符号）"
        error={passwordError ?? undefined}
      >
        <PasswordInput
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(null);
          }}
          placeholder="••••••"
          autoComplete="new-password"
          showPassword={showPassword}
          onToggleShow={() => setShowPassword(!showPassword)}
          hasError={!!passwordError}
        />
      </FormField>

      <FormField label="确认密码" error={confirmError ?? undefined}>
        <PasswordInput
          value={confirmPassword}
          onChange={(v) => {
            setConfirmPassword(v);
            if (confirmError) setConfirmError(null);
          }}
          placeholder="再输入一次"
          autoComplete="new-password"
          showPassword={showPassword}
          onToggleShow={() => setShowPassword(!showPassword)}
          hasError={!!confirmError}
        />
      </FormField>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full h-11 mt-5 bg-primary text-white rounded-xl font-semibold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {busy ? '注册中...' : '注册'}
      </button>
    </>
  );
}

/* ============================================================
 * 登录表单：昵称 + 密码（两个独立 error）
 * ========================================================== */
function LoginForm({
  onSuccess,
}: {
  onSuccess: (user: CurrentUser) => void;
}) {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Module 07 (2026-09-26)：useLayoutEffect + 多次 setTimeout 兜底
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    if (nicknameRef.current) {
      nicknameRef.current.focus();
    }
  }, []);
  useEffect(() => {
    const t1 = setTimeout(() => nicknameRef.current?.focus(), 50);
    const t2 = setTimeout(() => nicknameRef.current?.focus(), 200);
    const t3 = setTimeout(() => nicknameRef.current?.focus(), 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (busy) return;
    setNicknameError(null);
    setPasswordError(null);

    // 同步收集所有字段错误
    const errors = { nickname: null as string | null, password: null as string | null };
    if (!nickname.trim()) errors.nickname = '请输入昵称';
    if (!password) errors.password = '请输入密码';

    if (errors.nickname || errors.password) {
      setNicknameError(errors.nickname);
      setPasswordError(errors.password);
      return;
    }

    setBusy(true);
    const result = await loginByCredentials({ nickname, password });
    setBusy(false);

    if (!result.ok) {
      if (result.reason === 'not_found') {
        setNicknameError('该昵称未注册，请先注册账号');
        return;
      }
      if (result.reason === 'wrong_password') {
        setPasswordError('密码错误');
        return;
      }
      if (result.reason === 'network_error') {
        setNicknameError('无法连接到后端服务，请确认后端已启动后重试');
        return;
      }
      setNicknameError('登录失败，请重试');
      return;
    }

    onSuccess(result.user);
  };

  return (
    <>
      <FormField label="昵称" error={nicknameError ?? undefined}>
        <input
          ref={nicknameRef}
          autoFocus
          value={nickname}
          onChange={(e) => {
            // 过滤掉空格
            const filtered = e.target.value.replace(/\s/g, '');
            setNickname(filtered);
            if (nicknameError) setNicknameError(null);
          }}
          maxLength={20}
          placeholder="你注册时用的昵称"
          style={{ paddingLeft: '12px', paddingRight: '12px' }}
          className={`w-full h-11 bg-card border rounded-xl text-[14px] outline-none transition-colors ${
            nicknameError
              ? 'border-stone-500 focus:border-foreground'
              : 'border-border focus:border-primary'
          }`}
        />
      </FormField>

      <FormField label="密码" error={passwordError ?? undefined}>
        <PasswordInput
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(null);
          }}
          placeholder="••••••"
          autoComplete="current-password"
          showPassword={showPassword}
          onToggleShow={() => setShowPassword(!showPassword)}
          hasError={!!passwordError}
        />
      </FormField>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full h-11 mt-5 bg-primary text-white rounded-xl font-semibold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {busy ? '登录中...' : '登录'}
      </button>
    </>
  );
}

/* ============================================================
 * 通用：密码输入框（带右侧眼睛按钮）
 * ========================================================== */

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  showPassword: boolean;
  onToggleShow: () => void;
  hasError?: boolean;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  showPassword,
  onToggleShow,
  hasError,
}: PasswordInputProps) {
  return (
    <div className="relative">
      <input
        // type 永远保持 text，用 CSS -webkit-text-security 控制遮罩
        // 这样切换"显示/隐藏"时光标不会跳到开头
        type="text"
        value={value}
        onChange={(e) => onChange(asciiOnly(e.target.value))}
        onBlur={() => {
          // 失焦时自动恢复隐藏（防止明文密码停留在屏幕上）
          if (showPassword) onToggleShow();
        }}
        onMouseDown={(e) => {
          // Module 07 (2026-09-26)：Electron 内点击 input 偶尔不 focus，主动触发
          if (e.currentTarget !== document.activeElement) {
            e.preventDefault();
            e.currentTarget.focus();
          }
        }}
        tabIndex={0}
        spellCheck={false}
        autoComplete={autoComplete}
        maxLength={64}
        placeholder={placeholder}
        style={{
          paddingLeft: '12px',
          paddingRight: value.length > 0 ? '40px' : '12px',
          // Chrome/Safari/Edge：text 字符渲染为点
          // Firefox 不支持，会看到明文（demo 阶段可接受）
          // 注意：-webkit-text-security 不是 React 内置 CSS 属性，要 cast
          ...({
            WebkitTextSecurity: showPassword ? 'none' : 'disc',
            textSecurity: showPassword ? 'none' : 'disc',
          } as React.CSSProperties),
        }}
        className={`w-full h-11 bg-card border rounded-xl text-[14px] outline-none transition-colors ${
          hasError
            ? 'border-stone-500 focus:border-foreground'
            : 'border-border focus:border-primary'
        }`}
      />
      {value.length > 0 && (
        <button
          type="button"
          // 阻止 mousedown 默认行为，避免点眼睛时 input 失焦导致 onBlur 立即撤销切换
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleShow}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md hover:bg-stone-100 active:scale-95 transition-all"
        >
          {showPassword ? (
            <Eye className="w-4 h-4 text-muted" aria-hidden="true" />
          ) : (
            <EyeOff className="w-4 h-4 text-muted" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

/* ============================================================
 * 通用：ID 显示（带复制按钮）
 * ========================================================== */
function IdDisplay({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 不可用时静默失败
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 border border-border rounded-lg">
      <code className="flex-1 text-[15px] font-mono text-foreground break-all">
        {id}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="复制 ID"
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-stone-200 active:scale-95 transition-all"
      >
        {copied ? (
          <Check className="w-4 h-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4 text-muted" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}