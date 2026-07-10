import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { Card, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { SkillRows } from "@/components/SkillRows";
import { SessionCard } from "@/components/SessionCard";
import { NotesPanel } from "@/components/Thread";
import { fmtDay } from "@/lib/scoring";
import { memberName, sessionsOf, useStore } from "@/store";
import { cn } from "@/lib/utils";

export function usePerson() {
  const { uid = "" } = useParams();
  const { members, sessions, rubrics, retractions } = useStore();
  const member = members.find((m) => m.uid === uid);
  const ss = sessionsOf(sessions, uid);
  const latestRubric = ss.length
    ? rubrics.find((r) => r.id === ss.at(-1)!.rubricId)?.rubric
    : rubrics[0]?.rubric;
  return { uid, member, ss, latestRubric, retractions: retractions.filter((r) => r.traineeUid === uid) };
}

// Person-first layout: the person is the page; Summary and Sessions are tabs.
export function PersonLayout() {
  const { member, uid } = usePerson();
  if (!member) {
    return (
      <Card>
        <p>
          Unknown member. <Link className="text-accent underline" to="/">Back to people</Link>
        </p>
      </Card>
    );
  }
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-full px-4 py-1.5 text-sm",
      isActive ? "bg-accent/15 font-semibold text-accent" : "hover:bg-accent/10",
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← People
        </Link>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{memberName(member)}</h1>
        <RoleBadge role={member.role} />
        <div className="ml-auto flex gap-1 rounded-full border border-line bg-card p-1">
          <NavLink to={`/person/${uid}`} end className={tab}>
            Summary
          </NavLink>
          <NavLink to={`/person/${uid}/sessions`} className={tab}>
            Sessions & Conversations
          </NavLink>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

export function PersonSummary() {
  const { uid, ss, latestRubric } = usePerson();
  return (
    <Card>
      <CardTitle>Progress by skill area</CardTitle>
      {ss.length === 0 ? (
        <p className="text-sm text-muted">
          No shared sessions yet — progress appears once the trainee shares from the app.
        </p>
      ) : (
        <>
          <SkillRows uid={uid} dims={latestRubric?.dimensions ?? []} sessions={ss} />
          <p className="mt-3 text-xs text-muted">Tap a skill area for the session-by-session detail.</p>
        </>
      )}
    </Card>
  );
}

export function PersonSessions() {
  const { uid, ss, latestRubric, retractions } = usePerson();
  const { rubrics } = useStore();
  const timeline = [
    ...ss.map((s) => ({ at: s.recordedAt ?? "", kind: "session" as const, s })),
    ...retractions.map((r) => ({ at: r.recordedAt ?? "", kind: "retraction" as const, r })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>General notes</CardTitle>
        <NotesPanel traineeUid={uid} placeholder={`Write a general note…`} />
      </Card>
      {timeline.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-muted">
            No shared sessions yet — they appear here as soon as the trainee shares from the app.
          </p>
        </Card>
      )}
      {timeline.map((t) =>
        t.kind === "session" ? (
          <SessionCard
            key={t.s.sessionId}
            session={t.s}
            rubric={rubrics.find((r) => r.id === t.s.rubricId)?.rubric ?? latestRubric}
          />
        ) : (
          <p
            key={`r-${t.r.retractedAt}`}
            className="text-center text-sm italic text-muted"
          >
            A session from {fmtDay(t.r.recordedAt)} was retracted by the trainee on{" "}
            {fmtDay(t.r.retractedAt)}.
          </p>
        ),
      )}
    </div>
  );
}
