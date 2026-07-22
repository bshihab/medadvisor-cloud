import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Paperclip, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDay, roleLabel } from "@/lib/scoring";
import { markChatSeen, useStore } from "@/store";
import type { Note, Reply } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { usePerson } from "./Person";

export interface ChatAnchor {
  sessionId: string;
  criterionId?: string;
  label: string;
}

interface Msg {
  id: string;
  root: Note;
  reply?: Reply;
  text: string;
  authorUid: string;
  authorEmail: string | null;
  authorRole: "admin" | "trainee";
  createdAt: string | null;
}

// One trainee's whole conversation, Messages-style: chronological bubbles by
// author, day separators, anchor chips that jump to the session/criterion,
// composer pinned at the bottom ("improved chat" brief, PLAN.md MC8).
export function PersonChat() {
  const { uid, member, ss } = usePerson();
  const { me, notes, rubrics, refreshNotes } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const org = me.org!.orgId;

  const [anchor, setAnchor] = useState<ChatAnchor | null>(
    () => (location.state as { anchor?: ChatAnchor } | null)?.anchor ?? null,
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const msgs = useMemo(() => {
    const out: Msg[] = [];
    for (const n of notes.filter((n) => n.traineeUid === uid)) {
      out.push({
        id: n.noteId, root: n, text: n.text, authorUid: n.authorUid,
        authorEmail: n.authorEmail, authorRole: n.authorRole, createdAt: n.createdAt,
      });
      for (const r of n.replies) {
        out.push({
          id: r.replyId, root: n, reply: r, text: r.text, authorUid: r.authorUid,
          authorEmail: r.authorEmail, authorRole: r.authorRole, createdAt: r.createdAt,
        });
      }
    }
    return out.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  }, [notes, uid]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length, uid]);

  // Viewing the chat clears the unread dot on the People page: mark seen on open
  // and as new messages arrive while it's on screen.
  useEffect(() => {
    markChatSeen(uid);
  }, [uid, msgs.length]);

  if (!member) return null;

  const anchorLabel = (n: Note): string | null => {
    if (!n.sessionId) return null;
    const s = ss.find((x) => x.sessionId === n.sessionId);
    if (n.criterionId) {
      const rub = rubrics.find((r) => r.id === s?.rubricId)?.rubric;
      const prompt = rub?.criteria.find((c) => c.id === n.criterionId)?.prompt ?? n.criterionId;
      return prompt.length > 46 ? `${prompt.slice(0, 43)}…` : prompt;
    }
    return `Session · ${fmtDay(s?.recordedAt)}`;
  };

  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      const body: Record<string, string> = { traineeUid: uid, text: text.trim() };
      if (anchor) {
        body.sessionId = anchor.sessionId;
        if (anchor.criterionId) body.criterionId = anchor.criterionId;
      }
      await api(`/v1/orgs/${org}/notes`, { method: "POST", body: JSON.stringify(body) });
      await refreshNotes();
      setText("");
      setAnchor(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  };

  const pathOf = (m: Msg) =>
    m.reply
      ? `/v1/orgs/${org}/notes/${m.root.noteId}/replies/${m.reply.replyId}`
      : `/v1/orgs/${org}/notes/${m.root.noteId}`;

  let lastDay = "";
  let lastAuthor = "";

  return (
    <div className="glass-card flex h-[calc(100vh-220px)] min-h-[420px] flex-col overflow-hidden !p-0">
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto px-5 py-4">
        {msgs.length === 0 && (
          <p className="pt-16 text-center text-sm text-muted">
            No messages yet — start the conversation below.
          </p>
        )}
        {msgs.map((m) => {
          const mine = m.authorUid === me.uid;
          const day = fmtDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const authorKey = `${m.authorUid}-${day}`;
          const showAuthor = authorKey !== lastAuthor || showDay;
          lastAuthor = authorKey;
          const chip = !m.reply ? anchorLabel(m.root) : null;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center text-[11px] font-medium text-faint">{day}</div>
              )}
              {showAuthor && !mine && (
                <div className="mt-2 px-1 text-[11px] text-muted">
                  {m.authorEmail ?? "—"} ·{" "}
                  <span className={m.authorRole === "admin" ? "text-accent" : ""}>
                    {roleLabel(m.authorRole)}
                  </span>
                </div>
              )}
              <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap ${
                      mine ? "bg-accent text-white" : "bg-inset"
                    }`}
                  >
                    {chip && (
                      <button
                        className={`mb-1.5 flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                          mine ? "bg-white/20 text-white" : "bg-chip text-muted"
                        }`}
                        title="Jump to this session"
                        onClick={() =>
                          navigate(`/person/${uid}/sessions`, {
                            state: { scrollTo: `sess-${m.root.sessionId}` },
                          })
                        }
                      >
                        <Paperclip size={11} /> {chip}
                      </button>
                    )}
                    {editing === m.id ? (
                      <span className="block min-w-52">
                        <Textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className="bg-card text-ink"
                        />
                        <span className="mt-1.5 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-ink"
                            disabled={!draft.trim()}
                            onClick={async () => {
                              try {
                                await api(pathOf(m), {
                                  method: "PATCH",
                                  body: JSON.stringify({ text: draft.trim() }),
                                });
                                await refreshNotes();
                                setEditing(null);
                              } catch (e) {
                                setErr(e instanceof Error ? e.message : "Couldn't save edit");
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className={mine ? "text-white" : ""} onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </span>
                      </span>
                    ) : (
                      m.text
                    )}
                  </div>
                  {mine && editing !== m.id && (
                    <div className="h-4 text-[11px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="cursor-pointer underline"
                        onClick={() => {
                          setEditing(m.id);
                          setDraft(m.text);
                        }}
                      >
                        Edit
                      </button>{" "}
                      <button
                        className="cursor-pointer text-band-low underline"
                        onClick={async () => {
                          if (armed !== m.id) return setArmed(m.id);
                          try {
                            await api(pathOf(m), { method: "DELETE" });
                            setArmed(null);
                            await refreshNotes();
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : "Couldn't delete");
                            setArmed(null);
                          }
                        }}
                      >
                        {armed === m.id ? "Really delete?" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-rowline bg-inset/60 px-4 py-3">
        {anchor && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-[11.5px] text-accent">
            <Paperclip size={12} /> {anchor.label}
            <button className="cursor-pointer" title="Remove anchor" onClick={() => setAnchor(null)}>
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            placeholder={`Message ${member.email ?? "trainee"}…`}
            className="min-h-10 flex-1"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && text.trim() && !busy) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button disabled={busy || !text.trim()} onClick={send} title="Send">
            <Send size={16} />
          </Button>
        </div>
        {err && <p className="mt-1 text-xs text-band-low">{err}</p>}
      </div>
    </div>
  );
}
