import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-2 text-muted",
        rival: "border-rival/30 bg-rival/12 text-rival",
        victory: "border-victory/30 bg-victory/12 text-victory",
        ember: "border-ember/30 bg-ember/12 text-ember",
        danger: "border-danger/30 bg-danger/12 text-danger",
        cr: "border-cr/30 bg-cr/12 text-cr",
        bs: "border-bs/30 bg-bs/12 text-bs",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
