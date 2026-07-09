import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-xl border border-line bg-background px-3 py-1 text-sm outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-brand-indigo",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-16 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-brand-indigo",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 rounded-xl border border-line bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";
