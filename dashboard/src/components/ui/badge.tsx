import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
        className,
      )}
      style={style}
      {...props}
    />
  );
}

export const RoleBadge = ({ role }: { role: "admin" | "trainee" }) =>
  role === "admin" ? (
    <Badge className="bg-gradient-to-br from-brand-indigo to-brand-purple">Mentor</Badge>
  ) : (
    <Badge className="bg-muted">Trainee</Badge>
  );

export const ResultBadge = ({ result }: { result: string }) => (
  <Badge
    className={cn(
      result === "met" && "bg-band-high",
      result === "partial" && "bg-band-mid",
      result === "missed" && "bg-band-low",
      result === "na" && "bg-muted",
    )}
  >
    {result}
  </Badge>
);
