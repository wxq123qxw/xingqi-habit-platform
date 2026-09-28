import { useRef, useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 3;        // 从 5 → 3，高度变小一半
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2); // = 1
const STEP_DEG = 38;            // 补强：可见项少，每项角度加大
const RADIUS = 200;

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, '0')
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, '0')
);

interface WheelPickerProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

function WheelPicker({ items, value, onChange, ariaLabel }: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(() => {
    const idx = items.indexOf(value);
    return idx >= 0 ? idx : 0;
  });
  const [scrollFraction, setScrollFraction] = useState(selectedIdx);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = selectedIdx * ITEM_HEIGHT;
    }
  }, [selectedIdx]);

  useEffect(() => {
    const idx = items.indexOf(value);
    if (idx >= 0 && idx !== selectedIdx) {
      setSelectedIdx(idx);
      setScrollFraction(idx);
    }
  }, [value, items]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const fraction = scrollTop / ITEM_HEIGHT;
    setScrollFraction(fraction);

    const idx = Math.round(fraction);
    if (idx >= 0 && idx < items.length && idx !== selectedIdx) {
      setSelectedIdx(idx);
      onChange(items[idx]);
    }
  };

  return (
    <div
      className="wheel-picker-wrapper relative flex-1"
      style={{
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)',
        maskImage:
          'linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-9 border-y border-primary/25 pointer-events-none rounded-sm"
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="listbox"
        aria-label={ariaLabel}
        className="wheel-picker overflow-y-scroll no-scrollbar snap-y snap-mandatory"
        style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
      >
        <div style={{ height: ITEM_HEIGHT * CENTER_INDEX }} />
        {items.map((item, i) => {
          const offset = i - scrollFraction;
          const absOffset = Math.abs(offset);
          const angleDeg = offset * STEP_DEG;
          const angleRad = (angleDeg * Math.PI) / 180;
          const rotateX = `${-angleDeg}deg`;
          const translateZ = -RADIUS * (1 - Math.cos(angleRad));
          const scale = Math.max(0.7, 1 - absOffset * 0.12);
          const opacity = Math.max(0.15, 1 - absOffset * 0.32);
          const isSelected = absOffset < 0.5;

          return (
            <div
              key={item}
              className="text-center snap-center select-none"
              style={{
                height: ITEM_HEIGHT,
                lineHeight: `${ITEM_HEIGHT}px`,
                fontSize: '18px',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? '#1a1a1a' : absOffset < 1.5 ? '#888' : '#bbb',
                transform: `translateZ(${translateZ}px) rotateX(${rotateX}) scale(${scale})`,
                transformOrigin: 'center center',
                transformStyle: 'preserve-3d',
                opacity,
                transition: 'opacity 0.12s linear',
              }}
            >
              {item}
            </div>
          );
        })}
        <div style={{ height: ITEM_HEIGHT * CENTER_INDEX }} />
      </div>
    </div>
  );
}

interface ReminderTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ReminderTimeInput({
  value,
  onChange,
  error,
}: ReminderTimeInputProps) {
  const [hour = '00', minute = '00'] = value.split(':');
  const hasError = !!error;

  const handleHourChange = (newHour: string) => {
    onChange(`${newHour}:${minute}`);
  };

  const handleMinuteChange = (newMinute: string) => {
    onChange(`${hour}:${newMinute}`);
  };

  return (
    <div
      className={`flex items-stretch gap-2 px-4 py-2 bg-card rounded-xl border transition-colors ${
        hasError ? 'border-stone-500' : 'border-border'
      }`}
      style={{ perspective: '380px' }}
    >
      <Clock className="w-4 h-4 text-muted shrink-0 self-center" />
      <WheelPicker
        items={HOURS}
        value={hour}
        onChange={handleHourChange}
        ariaLabel="小时"
      />
      <span className="text-foreground text-[20px] font-semibold self-center">
        :
      </span>
      <WheelPicker
        items={MINUTES}
        value={minute}
        onChange={handleMinuteChange}
        ariaLabel="分钟"
      />
    </div>
  );
}