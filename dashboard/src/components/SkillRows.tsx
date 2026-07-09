import { Link } from "react-router-dom";
import { Spark } from "./Spark";
import { bandColor, bandName, dimensionScores, pct } from "@/lib/scoring";
import type { RubricDimension, Session } from "@/lib/types";

// One ROW per skill area: label · capsule bar · percent · trend line
// (unified viz spec, PLAN.md — identical semantics on all three surfaces).
export function SkillRows({
  uid,
  dims,
  sessions,
  linkToDetail = true,
}: {
  uid: string;
  dims: RubricDimension[];
  sessions: Session[];
  linkToDetail?: boolean;
}) {
  return (
    <div className="mt-2 space-y-1">
      {dims.map((d) => {
        const series = sessions.map((s) => dimensionScores(s)[d.id] ?? null);
        const latest = [...series].reverse().find((v) => v != null) ?? null;
        const color = latest != null ? bandColor(latest) : "var(--color-muted)";
        const row = (
          <div
            className="grid grid-cols-[minmax(120px,1fr)_minmax(120px,180px)_3.4rem_60px] items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-brand-indigo/10"
            title={latest != null ? `${bandName(latest)} — tap for detail` : undefined}
          >
            <span className="text-sm text-muted">{d.label} ›</span>
            <span className="block h-2.5 overflow-hidden rounded-full bg-[#88888833]">
              <span
                className="block h-full rounded-full"
                style={{ width: `${latest != null ? Math.round(latest * 100) : 0}%`, background: color }}
              />
            </span>
            <span
              className="text-right font-mono text-sm font-semibold tabular-nums"
              style={{ color: latest != null ? color : "var(--color-muted)" }}
            >
              {pct(latest)}
            </span>
            <Spark values={series} color={color} />
          </div>
        );
        return linkToDetail ? (
          <Link key={d.id} to={`/person/${uid}/skill/${d.id}`} className="block">
            {row}
          </Link>
        ) : (
          <div key={d.id}>{row}</div>
        );
      })}
    </div>
  );
}
