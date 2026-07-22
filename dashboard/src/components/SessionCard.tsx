import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { ResultBadge } from "./ui/badge";
import { fmtDay, fmtWhen, metOfY } from "@/lib/scoring";
import { useRubricAt } from "@/lib/rubricVersions";
import { useStore } from "@/store";
import type { Rubric, Session } from "@/lib/types";

// Conversations live in the Chat tab ("improved chat" brief): the 💬 on a
// criterion (and the Discuss button on the card) jump to Chat with the
// anchor prefilled. Counts still show how much discussion each has.
function CriterionRow({
  session,
  criterionId,
  prompt,
  result,
  evidence,
  tip,
}: {
  session: Session;
  criterionId: string;
  prompt: string;
  result: string;
  evidence: string | null;
  tip: string | null;
}) {
  const { notes } = useStore();
  const navigate = useNavigate();
  const count = notes.filter(
    (n) => n.sessionId === session.sessionId && n.criterionId === criterionId,
  ).length;
  return (
    <div className="ml-2 border-l border-line py-1.5 pl-3">
      <div className="flex flex-wrap items-start gap-2 text-sm">
        <ResultBadge result={result} />
        <span className="flex-1">{prompt}</span>
        <button
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs text-muted hover:bg-accent/10 hover:text-accent"
          title="Discuss this criterion in Chat"
          onClick={() =>
            navigate(`/person/${session.uid}/chat`, {
              state: {
                anchor: {
                  sessionId: session.sessionId,
                  criterionId,
                  label: prompt.length > 46 ? `${prompt.slice(0, 43)}…` : prompt,
                },
              },
            })
          }
        >
          <MessageCircle size={14} />
          {count > 0 ? count : ""}
        </button>
      </div>
      {evidence && (
        <blockquote className="my-1 ml-1 border-l-2 border-accent pl-2 text-sm italic text-muted">
          “{evidence}”
        </blockquote>
      )}
      {tip && <p className="ml-1 text-xs text-muted">💡 {tip}</p>}
    </div>
  );
}

export function SessionCard({ session, rubric }: { session: Session; rubric: Rubric | undefined }) {
  const navigate = useNavigate();
  const { notes } = useStore();
  // Render this session's criteria against the rubric VERSION it was scored with,
  // falling back to the current rubric for versions that predate history.
  const scored = useRubricAt(session.rubricId, session.rubricVersion, rubric);
  const dimLabel = (id: string) => scored?.dimensions.find((d) => d.id === id)?.label ?? id;
  const promptOf = (cid: string) => scored?.criteria.find((c) => c.id === cid)?.prompt ?? cid;
  const byDim: Record<string, Session["criteria"]> = {};
  for (const c of session.criteria) (byDim[c.dimension] ??= []).push(c);
  const [showCriteria, setShowCriteria] = useState(false);
  const discussionCount = notes.filter((n) => n.sessionId === session.sessionId).length;

  return (
    <Card id={`sess-${session.sessionId}`} className="scroll-mt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          <strong>{fmtWhen(session.recordedAt)}</strong>
          <span className="text-muted">
            {" "}
            · {session.location ?? ""} · {session.rubricId} v{session.rubricVersion}
          </span>{" "}
          · <strong>{metOfY(session)}</strong>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-muted"
          onClick={() =>
            navigate(`/person/${session.uid}/chat`, {
              state: {
                anchor: {
                  sessionId: session.sessionId,
                  label: `Session · ${fmtDay(session.recordedAt)}`,
                },
              },
            })
          }
        >
          <MessageCircle size={14} /> Discuss{discussionCount > 0 ? ` (${discussionCount})` : ""}
        </Button>
      </div>
      {session.summary && <p className="mt-2 text-sm">{session.summary}</p>}
      <button
        className="mt-2 cursor-pointer text-sm text-muted underline"
        onClick={() => setShowCriteria((s) => !s)}
      >
        Criteria ({session.criteria.length}) {showCriteria ? "▾" : "▸"}
      </button>
      {showCriteria && (
        <div className="mt-1 space-y-2">
          {Object.entries(byDim).map(([dim, cs]) => (
            <div key={dim}>
              <div className="text-sm font-semibold">{dimLabel(dim)}</div>
              {cs.map((c) => (
                <CriterionRow
                  key={c.id}
                  session={session}
                  criterionId={c.id}
                  prompt={promptOf(c.id)}
                  result={c.result}
                  evidence={c.evidence}
                  tip={c.tip}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
