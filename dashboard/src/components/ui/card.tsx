import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgb(30_27_46/0.05),0_8px_24px_-12px_rgb(99_102_241/0.25)]",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("mb-2 text-lg font-semibold tracking-tight", className)} {...props} />
);
