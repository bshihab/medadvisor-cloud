import { Link, useNavigate } from "react-router-dom";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spark } from "@/components/Spark";
import { Avatar } from "@/components/Avatar";
import { PageHead } from "@/components/PageHead";
import { SkillRow } from "@/components/SkillRows";
import { bandColor, bandName, dimensionScores, fmtDay, overallScore } from "@/lib/scoring";
import { memberName, sessionsOf, useStore } from "@/store";

// The console home: page header, Members card, Cohort-by-skill panel.
// Invite codes live on their own page (/invites).
export function People() {
  const { me, members, sessions, rubrics } = useStore();
  const navigate = useNavigate();

  // Cohort average per skill: mean of each trainee's LATEST non-null score.
  // Labels come from the rubric the cohort actually uses (majority of
  // sessions), not rubrics[0] — dimension ids overlap across rubrics but
  // their labels differ (e.g. inpatient's "Opening (Greeting)").
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.rubricId, (counts.get(s.rubricId) ?? 0) + 1);
  const topRubricId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const dims =
    (rubrics.find((r) => r.id === topRubricId) ?? rubrics[0])?.rubric.dimensions ?? [];
  const cohort = dims.map((d) => {
    const latest = members
      .map((m) => {
        const scores = sessionsOf(sessions, m.uid)
          .map((s) => dimensionScores(s)[d.id] ?? null)
          .filter((v): v is number => v != null);
        return scores.length ? scores[scores.length - 1] : null;
      })
      .filter((v): v is number => v != null);
    const avg = latest.length ? latest.reduce((a, b) => a + b, 0) / latest.length : null;
    return { label: d.label, avg };
  });
  const weakest = cohort
    .filter((c): c is { label: string; avg: number } => c.avg != null)
    .sort((a, b) => a.avg - b.avg)[0];

  return (
    <div>
      <PageHead title="People" sub={`${me.org!.name} · ${members.length} members`}>
        <Button onClick={() => navigate("/invites")}>New invite code</Button>
      </PageHead>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.42fr_1fr]">
        <Card className="p-0">
          <div className="px-5 pb-3.5 pt-[18px]">
            <CardTitle className="mb-0">Members</CardTitle>
            <p className="mt-1 text-[12.5px] text-muted">
              Pick a person to see their progress and sessions.
            </p>
          </div>
          <div>
            {members.length === 0 && (
              <p className="border-t border-rowline px-5 py-6 text-center text-sm text-muted">
                No members yet — create a trainee invite code to get people on board.
              </p>
            )}
            {members.map((m) => {
              const ss = sessionsOf(sessions, m.uid);
              const series = ss.map(overallScore);
              const latest = [...series].reverse().find((v) => v != null) ?? null;
              return (
                <Link
                  key={m.uid}
                  to={`/person/${m.uid}`}
                  className="flex items-center gap-3.5 border-t border-rowline px-5 py-[15px] transition-colors hover:bg-hoverfill"
                >
                  <Avatar name={memberName(m)} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-semibold">{memberName(m)}</b>
                    <small className="mt-0.5 block text-xs text-muted">
                      {ss.length} session{ss.length === 1 ? "" : "s"}
                      {ss.length > 0 && ` · last ${fmtDay(ss.at(-1)!.recordedAt)}`}
                    </small>
                  </div>
                  {latest != null && (
                    <Badge style={{ background: bandColor(latest) }}>{bandName(latest)}</Badge>
                  )}
                  <Spark values={series} color={latest != null ? bandColor(latest) : "#8888"} />
                  <span className="flex-none text-[17px] text-faint">›</span>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="p-0">
          <div className="px-5 pb-2.5 pt-[18px]">
            <CardTitle className="mb-0">Cohort by skill</CardTitle>
            <p className="mt-1 text-[12.5px] text-muted">Average of each trainee's latest score</p>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-3.5 pt-1">
            {cohort.map((c) => (
              <SkillRow key={c.label} label={c.label} values={c.avg != null ? [c.avg] : []} linkArrow={false} />
            ))}
          </div>
          {weakest && (
            <p className="mx-5 mb-3.5 rounded-xl bg-inset px-[13px] py-[11px] text-[12.5px] leading-normal text-muted">
              <b className="text-ink">{weakest.label}</b> is the cohort's weakest area right now —
              worth a teaching session.
            </p>
          )}
          <p className="mx-5 mb-[18px] text-[11px] text-faint">
            met = 1 · partial = 0.5 · missed = 0 · n/a excluded
          </p>
        </Card>
      </div>
    </div>
  );
}
