import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-indigo",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-brand-blue via-brand-indigo to-brand-purple text-white font-semibold hover:brightness-110",
        outline: "border border-line bg-card hover:border-brand-indigo",
        ghost: "hover:bg-brand-indigo/10",
        danger: "border border-line bg-card text-band-low hover:border-band-low",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 rounded-lg px-2.5 text-xs",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
