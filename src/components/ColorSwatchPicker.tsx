import { Check } from 'lucide-react';
import { COLOR_HEX, type HabitColor } from '../utils/colors';

// 18 色，按 3 行 × 6 列布局（暖 → 黄绿 → 冷）
const COLORS: HabitColor[] = [
  'red', 'rose', 'pink', 'coral', 'orange', 'amber',
  'yellow', 'lime', 'mint', 'green', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'lavender', 'purple', 'slate',
];

interface ColorSwatchPickerProps {
  value: HabitColor;
  onChange: (value: HabitColor) => void;
}

export function ColorSwatchPicker({
  value,
  onChange,
}: ColorSwatchPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {COLORS.map((color) => {
        const selected = value === color;
        const hex = COLOR_HEX[color];
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`选择颜色 ${color}`}
            aria-pressed={selected}
            className={`chip-gradient relative aspect-square transition-all active:scale-95 ${
              selected ? 'chip-gradient--active scale-105' : ''
            }`}
            style={{ backgroundColor: hex }}
          >
            {selected && (
              <Check
                className="absolute inset-0 m-auto w-3.5 h-3.5 text-white"
                strokeWidth={3.5}
                aria-hidden="true"
                style={{
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}