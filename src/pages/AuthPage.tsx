/**
 * AuthPage —— 登录/注册页（Nova 紫色星空主题）
 *
 * 视觉：与 SplashPage 同款星空主题（深紫 + 雾气 + 星星）
 * 功能：完全沿用 ProfileLogin 的验证规则 + 注册/登录逻辑
 *   - 昵称 1-20 字符,不含空格
 *   - 密码 ≥6 位,含字母+数字+特殊符号
 *   - 错误提示用黑色字体（text-foreground / 深紫文字）
 *   - 注册成功后 setCurrentUser,父级自动切到 app
 *   - 登录成功后 setCurrentUser,父级自动切到 app
 *
 * Module 09 流程：
 *   SplashPage(点"进入星空") → AuthPage → App
 */

import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import {
  getCurrentUser,
  registerUserWithPassword,
  loginByCredentials,
  type CurrentUser,
} from '../store/authStore';

interface AuthPageProps {
  /** 注册/登录成功后通知父级切到 app */
  onAuthSuccess: (user: CurrentUser) => void;
  /** 返回星启页（用户主动取消） */
  onBackToSplash?: () => void;
}

type Mode = 'register' | 'login';

/**
 * 过滤掉非 ASCII 字符和空格,只保留 ASCII 可打印字符（不含空格）
 * 用于昵称和密码输入
 */
function asciiOnly(value: string): string {
  return value.replace(/[^\x21-\x7E]/g, '');
}

export function AuthPage({ onAuthSuccess, onBackToSplash }: AuthPageProps) {
  const existing = getCurrentUser();
  if (existing) {
    // 已登录但还停留在 auth 页（异常路径） → 直接前进
    onAuthSuccess(existing);
    return null;
  }

  return <AuthView onSuccess={onAuthSuccess} onBack={onBackToSplash} />;
}

/* ============================================================
 * 已登录异常态（已登录却来到 AuthPage）
 * ========================================================== */
function AlreadyLoggedIn() {
  return null;
}

/* ============================================================
 * 未登录态：注册 / 登录 双 tab
 * ========================================================== */
function AuthView({
  onSuccess,
  onBack,
}: {
  onSuccess: (user: CurrentUser) => void;
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('register');
  return (
    <main
      className="relative w-full overflow-hidden flex flex-col items-center justify-center min-h-screen"
      style={{
        paddingTop: 'clamp(0.5rem, 2vw, 1.5rem)',
        paddingBottom: 'clamp(1rem, 4vw, 3rem)',
        paddingLeft: 'clamp(1rem, 4vw, 3rem)',
        paddingRight: 'clamp(1rem, 4vw, 3rem)',
        backgroundColor: '#0d0318',
        color: '#f3e8ff',
        padding: 'clamp(1rem, 4vw, 3rem)',
      }}
    >
      {/* 背景层：雾气 + 星星（淡化版,不影响表单阅读） */}
      <BackgroundFx />

      {/* 返回按钮（可选） */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="返回星启页"
          className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full text-[12px] transition-all active:scale-95"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            color: '#c4b5fd',
            border: '1px solid rgba(168, 85, 247, 0.28)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          ‹ 返回
        </button>
      )}

      {/* 主内容：标题 + 表单 */}
      <section
        className="relative w-full flex flex-col items-center"
        style={{
          zIndex: 10,
          maxWidth: 380,
          gap: '1.25rem',
        }}
      >
        {/* 标题区 */}
        <div className="text-center mb-2">
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 5vw, 2.25rem)',
              fontWeight: 700,
              color: '#f3e8ff',
              margin: 0,
              textShadow: '0 0 24px rgba(168, 85, 247, 0.4)',
            }}
          >
            星启
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#c4b5fd',
              margin: '6px 0 0',
            }}
          >
            {mode === 'register'
              ? '创建你的专属 ID,开启星河之旅'
              : '欢迎回来,继续你的星河之旅'}
          </p>
        </div>

        {/* tab 切换 */}
        <div
          className="w-full flex p-1 rounded-2xl"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(168, 85, 247, 0.20)',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('register')}
            className="flex-1 h-9 text-[13px] font-semibold rounded-xl transition-colors"
            style={{
              background: mode === 'register' ? '#a855f7' : 'transparent',
              color: mode === 'register' ? '#ffffff' : '#c4b5fd',
            }}
          >
            注册新账号
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className="flex-1 h-9 text-[13px] font-semibold rounded-xl transition-colors"
            style={{
              background: mode === 'login' ? '#a855f7' : 'transparent',
              color: mode === 'login' ? '#ffffff' : '#c4b5fd',
            }}
          >
            登录
          </button>
        </div>

        {/* 表单卡 */}
        {mode === 'register' ? (
          <RegisterForm onSuccess={onSuccess} />
        ) : (
          <LoginForm onSuccess={onSuccess} />
        )}
      </section>
    </main>
  );
}

/* ============================================================
 * 背景：雾气 + 星星（淡化版）
 * ========================================================== */
function BackgroundFx() {
  return (
    <>
      {/* 雾气 */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '60vw',
            height: '60vw',
            top: '-15%',
            left: '-20%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(192, 132, 252, 0.18) 0%, transparent 70%)',
            animation: 'authMistDrift 24s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: '50vw',
            height: '50vw',
            bottom: '-20%',
            right: '-15%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(88, 28, 135, 0.28) 0%, transparent 70%)',
            animation: 'authMistDrift 30s linear infinite',
          }}
        />
      </div>
      {/* 星星（少量,防止抢戏） */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: 60 }).map((_, i) => {
          const size = Math.random() * 1.6 + 0.8;
          return (
            <span
              key={i}
              style={{
                position: 'absolute',
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                borderRadius: '50%',
                background: '#ffffff',
                opacity: 0.5 + Math.random() * 0.3,
                boxShadow: '0 0 3px rgba(255,255,255,0.4)',
                animation: `authTwinkle ${
                  2 + Math.random() * 3
                }s ease-in-out ${Math.random() * 5}s infinite alternate`,
              }}
            />
          );
        })}
      </div>
      <style>{`
        @keyframes authTwinkle {
          0% { opacity: 0.3; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes authMistDrift {
          0% { transform: translateX(-10%) translateY(0) scale(1); }
          50% { transform: translateX(10%) translateY(-3%) scale(1.05); }
          100% { transform: translateX(-10%) translateY(0) scale(1); }
        }
      `}</style>
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

  // 输入框 mount 时自动 focus
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (nicknameRef.current) nicknameRef.current.focus();
  }, []);

  const handleSubmit = async () => {
    if (busy) return;

    const errors: {
      nickname: string | null;
      password: string | null;
      confirm: string | null;
    } = { nickname: null, password: null, confirm: null };

    if (!nickname.trim()) {
      errors.nickname = '请输入昵称';
    } else if (nickname.trim().length > 20) {
      errors.nickname = '昵称不超过 20 字符';
    } else if (/\s/.test(nickname)) {
      errors.nickname = '昵称不能包含空格';
    }

    if (!password) {
      errors.password = '请输入密码';
    } else if (password.length < 6) {
      errors.password = '密码至少 6 位';
    } else if (!/[a-zA-Z]/.test(password)) {
      errors.password = '密码需要包含字母';
    } else if (!/\d/.test(password)) {
      errors.password = '密码需要包含数字';
    } else if (!/[!-/:-@\[-`{-~]/.test(password)) {
      errors.password = '密码需要包含特殊符号';
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

    setBusy(true);
    const result = await registerUserWithPassword({ nickname, password });
    setBusy(false);

    if (!result.ok) {
      const msgMap: Record<string, string> = {
        empty: '请输入昵称',
        too_long: '昵称不超过 20 字符',
        weak_password: '密码需包含字母+数字+特殊符号',
        nickname_taken: '这个昵称已被占用',
      };
      setNicknameError(msgMap[result.reason] || '注册失败,请重试');
      return;
    }

    setGenerated(result.user);
    setTimeout(() => onSuccess(result.user), 1500);
  };

  if (generated) {
    return (
      <SuccessCard
        title="注册成功"
        user={generated}
        onContinue={() => onSuccess(generated)}
      />
    );
  }

  return (
    <section
      className="w-full flex flex-col gap-3"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(168, 85, 247, 0.28)',
        borderRadius: 18,
        padding: '20px',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(168, 85, 247, 0.18)',
      }}
    >
      <Field
        label="昵称"
        error={nicknameError}
        help="20 字以内,不含空格"
      >
        <input
          ref={nicknameRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          tabIndex={0}
          value={nickname}
          onChange={(e) => {
            const filtered = e.target.value.replace(/\s/g, '');
            setNickname(filtered);
            if (nicknameError) setNicknameError(null);
          }}
          maxLength={20}
          placeholder="例如:星河漫游者"
          className="w-full h-11 rounded-xl outline-none transition-colors"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: `1.5px solid ${
              nicknameError
                ? 'rgba(220, 38, 38, 0.6)'
                : 'transparent'
            }`,
            color: '#f3e8ff',
            padding: '0 14px',
            fontSize: 14,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.6)';
            e.currentTarget.style.boxShadow =
              '0 0 0 4px rgba(168, 85, 247, 0.15)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = nicknameError
              ? 'rgba(220, 38, 38, 0.6)'
              : 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </Field>

      <Field
        label="密码（至少 6 位,含字母+数字+特殊符号）"
        error={passwordError}
        help="6 位以上,需包含字母、数字、特殊符号"
      >
        <PasswordInput
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(null);
          }}
          placeholder="••••••"
          showPassword={showPassword}
          onToggleShow={() => setShowPassword(!showPassword)}
          hasError={!!passwordError}
        />
      </Field>

      <Field label="确认密码" error={confirmError}>
        <PasswordInput
          value={confirmPassword}
          onChange={(v) => {
            setConfirmPassword(v);
            if (confirmError) setConfirmError(null);
          }}
          placeholder="再输入一次"
          showPassword={showPassword}
          onToggleShow={() => setShowPassword(!showPassword)}
          hasError={!!confirmError}
        />
      </Field>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full h-11 mt-2 text-[14px] font-bold transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
        style={{
          background: busy
            ? 'rgba(168, 85, 247, 0.4)'
            : '#a855f7',
          color: '#ffffff',
          borderRadius: 999,
          border: '1px solid rgba(168, 85, 247, 0.5)',
          boxShadow: '0 0 24px rgba(168, 85, 247, 0.4)',
        }}
      >
        <UserPlus className="w-4 h-4" aria-hidden="true" />
        {busy ? '注册中...' : '注册'}
      </button>
    </section>
  );
}

/* ============================================================
 * 登录表单：昵称 + 密码
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
  const [busy, setBusy] = useState(false);

  const nicknameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (nicknameRef.current) nicknameRef.current.focus();
  }, []);

  const handleSubmit = async () => {
    if (busy) return;

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
      const msgMap: Record<string, string> = {
        not_found: '该昵称未注册,请先注册账号',
        wrong_password: '密码错误',
        network_error: '无法连接到后端服务,请确认后端已启动',
      };
      const r = result.reason;
      if (r === 'not_found') setNicknameError(msgMap.not_found);
      else if (r === 'wrong_password') setPasswordError(msgMap.wrong_password);
      else if (r === 'network_error') setNicknameError(msgMap.network_error);
      else setNicknameError('登录失败,请重试');
      return;
    }

    onSuccess(result.user);
  };

  return (
    <section
      className="w-full flex flex-col gap-3"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(168, 85, 247, 0.28)',
        borderRadius: 18,
        padding: '20px',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(168, 85, 247, 0.18)',
      }}
    >
      <Field label="昵称" error={nicknameError}>
        <input
          ref={nicknameRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={nickname}
          onChange={(e) => {
            const filtered = e.target.value.replace(/\s/g, '');
            setNickname(filtered);
            if (nicknameError) setNicknameError(null);
          }}
          maxLength={20}
          placeholder="你注册时用的昵称"
          className="w-full h-11 rounded-xl outline-none transition-colors"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: `1.5px solid ${
              nicknameError
                ? 'rgba(220, 38, 38, 0.6)'
                : 'transparent'
            }`,
            color: '#f3e8ff',
            padding: '0 14px',
            fontSize: 14,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.6)';
            e.currentTarget.style.boxShadow =
              '0 0 0 4px rgba(168, 85, 247, 0.15)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = nicknameError
              ? 'rgba(220, 38, 38, 0.6)'
              : 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </Field>

      <Field label="密码" error={passwordError}>
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
      </Field>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full h-11 mt-2 text-[14px] font-bold transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
        style={{
          background: busy ? 'rgba(168, 85, 247, 0.4)' : '#a855f7',
          color: '#ffffff',
          borderRadius: 999,
          border: '1px solid rgba(168, 85, 247, 0.5)',
          boxShadow: '0 0 24px rgba(168, 85, 247, 0.4)',
        }}
      >
        <LogIn className="w-4 h-4" aria-hidden="true" />
        {busy ? '登录中...' : '登录'}
      </button>
    </section>
  );
}

/* ============================================================
 * 通用：表单字段（label + error/help + input slot）
 * ========================================================== */
function Field({
  label,
  error,
  help,
  children,
}: {
  label: string;
  error?: string | null;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[12px] font-semibold"
        style={{ color: '#c4b5fd' }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p
          className="mt-1.5 text-[12px]"
          style={{ color: '#f3e8ff', fontWeight: 500 }}
        >
          {error}
        </p>
      ) : help ? (
        <p
          className="mt-1.5 text-[11px]"
          style={{ color: 'rgba(196, 181, 253, 0.65)' }}
        >
          {help}
        </p>
      ) : null}
    </div>
  );
}

/* ============================================================
 * 通用：密码输入框（带右侧眼睛按钮）
 * ========================================================== */
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  showPassword,
  onToggleShow,
  hasError,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  showPassword: boolean;
  onToggleShow: () => void;
  hasError?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(asciiOnly(e.target.value))}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        maxLength={64}
        tabIndex={0}
        className="w-full h-11 rounded-xl outline-none transition-colors"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          border: `1.5px solid ${
            hasError ? 'rgba(220, 38, 38, 0.6)' : 'transparent'
          }`,
          color: '#f3e8ff',
          padding: '0 44px 0 14px',
          fontSize: 14,
          // CSS text-security 模拟 password mask（多数浏览器支持）
          // 注意：-webkit-text-security 不是 React 内置 CSS 属性，要 cast
          ...({
            WebkitTextSecurity: showPassword ? 'none' : 'disc',
            textSecurity: showPassword ? 'none' : 'disc',
          } as React.CSSProperties),
        }}
        onFocus={(e) => {
          if (!hasError) {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.6)';
            e.currentTarget.style.boxShadow =
              '0 0 0 4px rgba(168, 85, 247, 0.15)';
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = hasError
            ? 'rgba(220, 38, 38, 0.6)'
            : 'transparent';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleShow}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md active:scale-95 transition-all"
          style={{ color: '#c4b5fd' }}
        >
          {showPassword ? (
            <Eye className="w-4 h-4" aria-hidden="true" />
          ) : (
            <EyeOff className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

/* ============================================================
 * 成功卡（注册后展示 ID + 复制 + 进入按钮）
 * ========================================================== */
function SuccessCard({
  title,
  user,
  onContinue,
}: {
  title: string;
  user: CurrentUser;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默失败
    }
  };

  return (
    <section
      className="w-full flex flex-col gap-3 text-center"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(168, 85, 247, 0.28)',
        borderRadius: 18,
        padding: '20px',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(168, 85, 247, 0.18)',
      }}
    >
      <div className="text-[44px]" aria-hidden="true">
        ✨
      </div>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#f3e8ff',
          margin: 0,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: '#c4b5fd',
          margin: '4px 0 0',
        }}
      >
        你的唯一 ID（加好友时把这个给对方,密码别告诉别人）
      </p>

      {/* ID 复制 */}
      <button
        type="button"
        onClick={handleCopy}
        className="w-full px-4 py-3 rounded-xl flex items-center justify-between active:scale-95 transition-all"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(168, 85, 247, 0.28)',
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#f3e8ff',
          letterSpacing: '0.05em',
        }}
      >
        <span>{user.id}</span>
        <span style={{ color: '#a855f7', fontSize: 11 }}>
          {copied ? '✓ 已复制' : '点击复制'}
        </span>
      </button>

      <button
        type="button"
        onClick={onContinue}
        className="w-full h-11 mt-2 text-[14px] font-bold transition-all active:scale-95"
        style={{
          background: '#a855f7',
          color: '#ffffff',
          borderRadius: 999,
          border: '1px solid rgba(168, 85, 247, 0.5)',
          boxShadow: '0 0 24px rgba(168, 85, 247, 0.4)',
        }}
      >
        进入星河
      </button>
    </section>
  );
}

// Re-export for already-logged-in state (used by App to short-circuit)
export { AlreadyLoggedIn };