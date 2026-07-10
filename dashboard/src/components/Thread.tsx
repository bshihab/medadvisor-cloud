import { useState } from "react";
import { api } from "@/lib/api";
import { fmtDay, roleLabel } from "@/lib/scoring";
import { useStore } from "@/store";
import type { Note, Reply } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";

function Composer({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Textarea value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await onSubmit(text.trim());
              setText("");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Something went wrong");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Send"}
        </Button>
        {err && <span className="text-sm text-band-low">{err}</span>}
      </div>
    </div>
  );
}

function Entry({
  authorEmail,
  authorRole,
  createdAt,
  updatedAt,
  text,
  mine,
  onEdit,
  onDelete,
}: {
  authorEmail: string | null;
  authorRole: "admin" | "trainee";
  createdAt: string | null;
  updatedAt: string | null;
  text: string;
  mine: boolean;
  onEdit: (text: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="text-xs text-muted">
        <span className={authorRole === "admin" ? "font-medium text-accent" : ""}>
          {roleLabel(authorRole)}
        </span>{" "}
        · {authorEmail ?? "—"} · {fmtDay(createdAt)}
        {updatedAt !== createdAt && " · edited"}
        {mine && !editing && (
          <>
            {" · "}
            <button className="cursor-pointer underline" onClick={() => setEditing(true)}>
              Edit
            </button>{" "}
            <button
              className="cursor-pointer text-band-low underline disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                if (!armed) return setArmed(true);
                setBusy(true);
                await onDelete().finally(() => setBusy(false));
              }}
            >
              {armed ? "Really delete?" : "Delete"}
            </button>
          </>
        )}
      </div>
      {editing ? (
        <div className="mt-1 space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !draft.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await onEdit(draft.trim());
                  setEditing(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 text-sm whitespace-pre-wrap">{text}</p>
      )}
    </div>
  );
}

// A root note + its replies + the reply composer. Mentors can always reply;
// editing/deleting is author-only (the API enforces it too).
export function Thread({ note }: { note: Note }) {
  const { me, refreshNotes } = useStore();
  const org = me.org!.orgId;
  const base = `/v1/orgs/${org}/notes/${note.noteId}`;
  return (
    <div className="rounded-xl border border-line bg-inset px-3 py-1.5">
      <Entry
        {...note}
        mine={note.authorUid === me.uid}
        onEdit={async (text) => {
          await api(base, { method: "PATCH", body: JSON.stringify({ text }) });
          await refreshNotes();
        }}
        onDelete={async () => {
          await api(base, { method: "DELETE" });
          await refreshNotes();
        }}
      />
      {note.replies.length > 0 && (
        <div className="ml-4 border-l-2 border-accent/30 pl-3">
          {note.replies.map((r: Reply) => (
            <Entry
              key={r.replyId}
              {...r}
              mine={r.authorUid === me.uid}
              onEdit={async (text) => {
                await api(`${base}/replies/${r.replyId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ text }),
                });
                await refreshNotes();
              }}
              onDelete={async () => {
                await api(`${base}/replies/${r.replyId}`, { method: "DELETE" });
                await refreshNotes();
              }}
            />
          ))}
        </div>
      )}
      <Composer
        placeholder="Reply…"
        onSubmit={async (text) => {
          await api(`${base}/replies`, { method: "POST", body: JSON.stringify({ text }) });
          await refreshNotes();
        }}
      />
    </div>
  );
}

// A list of threads for one context (general / session / criterion) plus a
// composer that creates a new root note in that context.
export function NotesPanel({
  traineeUid,
  sessionId = null,
  criterionId = null,
  placeholder,
}: {
  traineeUid: string;
  sessionId?: string | null;
  criterionId?: string | null;
  placeholder: string;
}) {
  const { me, notes, refreshNotes } = useStore();
  const org = me.org!.orgId;
  const items = notes.filter(
    (n) =>
      n.traineeUid === traineeUid &&
      (n.sessionId ?? null) === sessionId &&
      (n.criterionId ?? null) === criterionId,
  );
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
      {items.map((n) => (
        <Thread key={n.noteId} note={n} />
      ))}
      <Composer
        placeholder={placeholder}
        onSubmit={async (text) => {
          const body: Record<string, string> = { traineeUid, text };
          if (sessionId) body.sessionId = sessionId;
          if (criterionId) body.criterionId = criterionId;
          await api(`/v1/orgs/${org}/notes`, { method: "POST", body: JSON.stringify(body) });
          await refreshNotes();
        }}
      />
    </div>
  );
}
