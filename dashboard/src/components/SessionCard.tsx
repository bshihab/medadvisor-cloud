import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Card } from "./ui/card";
import { ResultBadge } from "./ui/badge";
import { NotesPanel } from "./Thread";
import { fmtWhen, metOfY } from "@/lib/scoring";
import { useStore } from "@/store";
import type { Rubric, Session } from "@/lib/types";

// Per-criterion comment affordance (MC8): each criterion row gets a 💬 with
// its thread count; expanding shows the threads + composer anchored to that
// criterion. Session-level and general notes stay separate panels.
function CriterionRow({
  session,
  criterionId,
  dimensionLabel,
  prompt,
  result,
  evidence,
  tip,
}: {
  session: Session;
  criterionId: string;
  dimensionLabel: string;
  prompt: string;
  result: string;
  evidence: string | null;
  tip: string | null;
}) {
  const { notes } = useStore();
  const [open, setOpen] = useState(false);
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
          onClick={() => setOpen((o) => !o)}
          title={`Comment on this criterion (${dimensionLabel})`}
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
      {open && (
        <div className="mt-2">
          <NotesPanel
            traineeUid={session.uid}
            sessionId={session.sessionId}
            criterionId={criterionId}
            placeholder="Comment on this criterion…"
          />
        </div>
      )}
    </div>
  );
}

export function SessionCard({ session, rubric }: { session: Session; rubric: Rubric | undefined }) {
  const dimLabel = (id: string) => rubric?.dimensions.find((d) => d.id === id)?.label ?? id;
  const promptOf = (cid: string) => rubric?.criteria.find((c) => c.id === cid)?.prompt ?? cid;
  const byDim: Record<string, Session["criteria"]> = {};
  for (const c of session.criteria) (byDim[c.dimension] ??= []).push(c);
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <Card id={`sess-${session.sessionId}`} className="scroll-mt-4">
      <div className="text-sm">
        <strong>{fmtWhen(session.recordedAt)}</strong>
        <span className="text-muted">
          {" "}
          · {session.location ?? ""} · {session.rubricId} v{session.rubricVersion}
        </span>{" "}
        · <strong>{metOfY(session)}</strong>
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
                  dimensionLabel={dimLabel(dim)}
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
      <div className="mt-3">
        <h3 className="mb-1 text-sm font-semibold">Session notes</h3>
        <NotesPanel
          traineeUid={session.uid}
          sessionId={session.sessionId}
          placeholder="Write a note about this session…"
        />
      </div>
    </Card>
  );
}
