import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Spark } from "./Spark";
import { bandColor, bandName, dimensionScores, pct } from "@/lib/scoring";
import type { RubricDimension, Session } from "@/lib/types";

// One row of the unified "progress by skill area" viz (PLAN.md spec):
// label › · capsule bar · mono percent · trend spark. The bar grows in
// from 0 on mount (skipped under prefers-reduced-motion).
export function SkillRow({
  label,
  values,
  linkArrow = true,
}: {
  label: string;
  values: (number | null)[];
  linkArrow?: boolean;
}) {
  const present = values.filter((v): v is number => v != null);
  const latest = present.length ? present[present.length - 1] : null;
  const color = latest != null ? bandColor(latest) : "var(--color-muted)";
  const target = latest != null ? Math.round(latest * 100) : 0;
  const [w, setW] = useState(() =>
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
      ? target
      : 0,
  );
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  return (
    <div
      className="grid grid-cols-[minmax(120px,1fr)_minmax(120px,180px)_3.4rem_60px] items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent/10"
      title={latest != null ? bandName(latest) : undefined}
    >
      <span className="text-sm text-muted">
        {label}
        {linkArrow ? " ›" : ""}
      </span>
      <span className="block h-2.5 overflow-hidden rounded-full bg-track">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${w}%`,
            background: color,
            transition: "width 550ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </span>
      <span
        className="text-right font-mono text-sm font-semibold tabular-nums"
        style={{ color: latest != null ? color : "var(--color-muted)" }}
      >
        {pct(latest)}
      </span>
      <Spark values={values} color={color} />
    </div>
  );
}

export function SkillRows({
  uid,
  dims,
  sessions,
}: {
  uid: string;
  dims: RubricDimension[];
  sessions: Session[];
}) {
  return (
    <div className="mt-2 space-y-1">
      {dims.map((d) => {
        const series = sessions.map((s) => dimensionScores(s)[d.id] ?? null);
        return (
          <Link key={d.id} to={`/person/${uid}/skill/${d.id}`} className="block">
            <SkillRow label={d.label} values={series} />
          </Link>
        );
      })}
    </div>
  );
}
