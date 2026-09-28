import { REMINDER_TYPES, type ReminderType } from '../types/habit';

interface ReminderTypeSelectorProps {
  value: ReminderType;
  onChange: (value: ReminderType) => void;
}

export function ReminderTypeSelector({
  value,
  onChange,
}: ReminderTypeSelectorProps) {
  return (
    <div className="-mx-1 px-1">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {REMINDER_TYPES.map((type) => {
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              aria-pressed={selected}
              className={`pill-soft whitespace-nowrap active:scale-95 ${
                selected ? 'pill-soft--active' : ''
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}
