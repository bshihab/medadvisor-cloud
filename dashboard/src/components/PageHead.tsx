import type { ReactNode } from "react";

// Shared page-header pattern (ambient-glass handoff): 27px title, muted
// 13.5px subline, optional primary action on the right.
export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-[5px] text-[13.5px] text-muted">{sub}</p>}
      </div>
      {children}
    </header>
  );
}
