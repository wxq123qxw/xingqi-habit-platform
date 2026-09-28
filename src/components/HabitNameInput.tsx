import { useState, useEffect } from 'react';
import { HABIT_LIMITS } from '../types/habit';

interface HabitNameInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function HabitNameInput({
  value,
  onChange,
  error,
}: HabitNameInputProps) {
  // inputValue: 输入框实际显示的（IME 拼字阶段可临时超过 MAX）
  // committedValue: 已提交到父级的（强制 <= MAX）
  // 计数 = committedValue.length —— 这样 IME 拼字阶段拼音不会被计入
  const [inputValue, setInputValue] = useState(value);
  const [committedValue, setCommittedValue] = useState(value);
  const [isComposing, setIsComposing] = useState(false);

  // 父级 value 变化时（非 composition 状态）同步
  useEffect(() => {
    if (!isComposing) {
      setInputValue(value);
      setCommittedValue(value);
    }
  }, [value, isComposing]);

  const MAX = HABIT_LIMITS.nameMax;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!isComposing) {
      // 非 IME：input 已被 maxLength 截到 MAX，直接提交
      setInputValue(v);
      setCommittedValue(v);
      onChange(v);
    } else {
      // IME 组字中：只更新本地，不通知父级
      setInputValue(v);
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>
  ) => {
    setIsComposing(false);
    // IME 提交后再截断一次（部分浏览器在 IME 阶段可能绕过 maxLength）
    let v = (e.target as HTMLInputElement).value;
    if (v.length > MAX) v = v.slice(0, MAX);
    setInputValue(v);
    setCommittedValue(v);
    onChange(v);
  };

  const hasError = !!error;
  const displayCount = Math.min(committedValue.length, MAX);

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        maxLength={MAX}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder="例如：每天阅读 30 分钟"
        aria-invalid={hasError}
        className={`input-soft w-full px-4 py-3 pr-16 text-[15px] text-foreground ${
          hasError ? 'border-stone-500 focus:border-foreground' : ''
        }`}
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted pointer-events-none tabular-nums">
        {displayCount}/{MAX}
      </span>
    </div>
  );
}