import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-faint">{label}</label>
        {hint ? <span className="text-xs text-faint tabular">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export const NumberInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    inputMode="numeric"
    className={cn(
      "h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg tabular placeholder:text-faint",
      "transition-colors hover:border-border-strong focus-visible:focus-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-danger aria-[invalid=true]:hover:border-danger",
      className,
    )}
    {...props}
  />
));
NumberInput.displayName = "NumberInput";

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-faint",
      "transition-colors hover:border-border-strong focus-visible:focus-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-danger aria-[invalid=true]:hover:border-danger",
      className,
    )}
    {...props}
  />
));
TextInput.displayName = "TextInput";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(
      "w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-faint",
      "transition-colors hover:border-border-strong focus-visible:focus-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-danger aria-[invalid=true]:hover:border-danger",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/** Inline validation message rendered under a Field's control. */
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-danger">{children}</p>;
}
