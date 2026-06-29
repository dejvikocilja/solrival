import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

/**
 * Identity avatar. We don't store uploaded images, so this renders deterministic
 * initials derived from the username, styled in the rival accent. Decorative —
 * the username is always shown alongside it in context.
 */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-rival/15 font-semibold uppercase text-rival ring-1 ring-rival/30",
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
