// Scoring + unified skill-area viz conventions (PLAN.md, SETTLED):
// met=1, partial=0.5, missed=0, N/A excluded; dimension score = mean over
// its criteria in that session. Bands: <40% red, 40–74% orange, ≥75% green.
import type { Session } from "./types";

const RESULT_SCORE: Record<string, number> = { met: 1, partial: 0.5, missed: 0 };

export function dimensionScores(session: Session): Record<string, number> {
  const per: Record<string, number[]> = {};
  for (const c of session.criteria) {
    if (c.result === "na") continue;
    (per[c.dimension] ??= []).push(RESULT_SCORE[c.result] ?? 0);
  }
  return Object.fromEntries(
    Object.entries(per).map(([d, arr]) => [d, arr.reduce((a, b) => a + b, 0) / arr.length]),
  );
}

export function overallScore(session: Session): number | null {
  const v = Object.values(dimensionScores(session));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const metOfY = (s: Session): string => {
  const applicable = s.criteria.filter((c) => c.result !== "na");
  const met = applicable.filter((c) => c.result === "met").length;
  return `${met} of ${applicable.length} met`;
};

export const bandColor = (x: number): string =>
  x < 0.4 ? "#FF3B30" : x < 0.75 ? "#FF9500" : "#34C759";
export const bandName = (x: number): string =>
  x < 0.4 ? "Emerging" : x < 0.75 ? "Developing" : "Proficient";

export const pct = (x: number | null | undefined): string =>
  x == null ? "—" : `${Math.round(x * 100)}%`;

export const fmtDay = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "—");
export const fmtWhen = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export const roleLabel = (r: string): string => (r === "admin" ? "Mentor" : "Trainee");
