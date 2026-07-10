import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-[color,background-color,border-color,filter,transform] cursor-pointer disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        default: "bg-accent text-white font-semibold btn-glow hover:brightness-[1.08]",
        outline: "border border-line bg-field hover:border-accent backdrop-blur-xl",
        ghost: "hover:bg-accent/10",
        danger: "border border-line bg-field text-band-low hover:border-band-low",
      },
      size: {
        default: "h-[38px] px-[18px]",
        sm: "h-7 rounded-lg px-2.5 text-xs",
        lg: "h-11 px-[22px]",
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
