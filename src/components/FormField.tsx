import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function FormField({
  label,
  error,
  hint,
  children,
}: FormFieldProps) {
  return (
    <div className="px-5 py-3">
      <label className="block text-[12px] font-medium text-muted mb-2 tracking-wide">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-2 text-[12px] text-foreground">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-[12px] text-muted opacity-70">{hint}</p>
      ) : null}
    </div>
  );
}
