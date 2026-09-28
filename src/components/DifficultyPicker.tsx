import { HABIT_LIMITS } from '../types/habit';

interface DifficultyPickerProps {
  value: number;
  onChange: (value: number) => void;
  error?: string;
}

const DIFFICULTY_LABELS = ['很轻松', '轻松', '适中', '困难', '很困难'];

export function DifficultyPicker({
  value,
  onChange,
  error,
}: DifficultyPickerProps) {
  const levels = Array.from(
    { length: HABIT_LIMITS.difficultyMax - HABIT_LIMITS.difficultyMin + 1 },
    (_, i) => i + HABIT_LIMITS.difficultyMin
  );

  return (
    <div>
      <div className="flex gap-2 justify-between">
        {levels.map((level) => {
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              aria-label={`难度 ${level}`}
              aria-pressed={selected}
              className={`flex-1 aspect-square max-w-[60px] mx-auto rounded-full border-2 text-[16px] font-extrabold transition-all active:scale-95 ${
                selected
                  ? 'text-white border-transparent scale-110'
                  : error
                    ? 'bg-card text-foreground border-stone-400'
                    : 'bg-card text-muted border-border'
              }`}
              style={
                selected
                  ? {
                      background:
                        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
                      boxShadow:
                        '0 6px 16px rgba(132, 250, 176, 0.4)',
                    }
                  : undefined
              }
            >
              {level}
            </button>
          );
        })}
      </div>
      <p
        className="text-center mt-3 text-[12px] font-semibold"
        style={{ color: '#a18cd1' }}
      >
        {DIFFICULTY_LABELS[value - 1]}
      </p>
    </div>
  );
}