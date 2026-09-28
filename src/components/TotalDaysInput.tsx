import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { HABIT_LIMITS } from '../types/habit';

interface TotalDaysInputProps {
  value: number;
  onChange: (value: number) => void;
  error?: string;
}

export function TotalDaysInput({
  value,
  onChange,
  error,
}: TotalDaysInputProps) {
  // 中间数字是可编辑 input 的本地 string
  const [textValue, setTextValue] = useState(String(value));

  // 外部 value 变化（+/- 按钮、父级重置）时同步
  useEffect(() => {
    setTextValue(String(value));
  }, [value]);

  const dec = () => {
    onChange(Math.max(HABIT_LIMITS.totalDaysMin, value - 1));
  };
  const inc = () => {
    onChange(Math.min(HABIT_LIMITS.totalDaysMax, value + 1));
  };

  /** blur 或按 Enter 时：解析 + clamp 到 [14, 365] */
  const commit = () => {
    const trimmed = textValue.trim();
    if (trimmed === '') {
      setTextValue(String(value));
      return;
    }
    const n = parseInt(trimmed, 10);
    if (isNaN(n)) {
      setTextValue(String(value));
      return;
    }
    const clamped = Math.max(
      HABIT_LIMITS.totalDaysMin,
      Math.min(HABIT_LIMITS.totalDaysMax, n)
    );
    onChange(clamped);
    setTextValue(String(clamped));
  };

  const hasError = !!error;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={dec}
        disabled={value <= HABIT_LIMITS.totalDaysMin}
        aria-label="减少天数"
        className="btn-circle-gradient btn-circle-minus transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Minus className="w-5 h-5" strokeWidth={2.5} />
      </button>

      <div className="flex-1 flex items-center justify-center gap-1 px-4 py-3 rounded-2xl input-soft">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={textValue}
          onChange={(e) => {
            // 只允许数字，最多 3 位（365）
            const v = e.target.value.replace(/\D/g, '').slice(0, 3);
            setTextValue(v);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="养成天数"
          className={`w-14 bg-transparent text-center text-[18px] font-extrabold tabular-nums outline-none ${
            hasError ? 'text-foreground' : 'text-foreground'
          }`}
        />
        <span className="text-[12px] font-medium text-muted">天</span>
      </div>

      <button
        type="button"
        onClick={inc}
        disabled={value >= HABIT_LIMITS.totalDaysMax}
        aria-label="增加天数"
        className="btn-circle-gradient btn-circle-plus transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
