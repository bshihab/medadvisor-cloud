import { Link } from "react-router-dom";
import { Card, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { Spark } from "@/components/Spark";
import { InvitesCard } from "@/components/InvitesCard";
import { bandColor, fmtDay, overallScore } from "@/lib/scoring";
import { memberName, sessionsOf, useStore } from "@/store";

// Person-first home: pick a person, everything else lives under them.
export function People() {
  const { me, members, sessions } = useStore();
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{me.org!.name}</CardTitle>
        <p className="mb-3 text-sm text-muted">Pick a person to see their progress and sessions.</p>
        {members.length === 0 && (
          <p className="py-6 text-center text-muted">
            No members yet — create a trainee invite code below to get people on board.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => {
            const ss = sessionsOf(sessions, m.uid);
            const series = ss.map(overallScore);
            const latest = [...series].reverse().find((v) => v != null) ?? null;
            return (
              <Link
                key={m.uid}
                to={`/person/${m.uid}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-background/60 px-4 py-3 hover:border-brand-indigo"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-blue via-brand-indigo to-brand-purple font-semibold text-white">
                  {memberName(m).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{memberName(m)}</div>
                  <div className="text-xs text-muted">
                    {ss.length} session{ss.length === 1 ? "" : "s"}
                    {ss.length > 0 && ` · last ${fmtDay(ss.at(-1)!.recordedAt)}`}
                  </div>
                </div>
                <RoleBadge role={m.role} />
                <Spark values={series} color={latest != null ? bandColor(latest) : "#8888"} />
              </Link>
            );
          })}
        </div>
      </Card>
      <InvitesCard />
    </div>
  );
}
