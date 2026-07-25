import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, publicApi } from "@/lib/api";
import type { Invite, Me, Member, Note, Retraction, RubricItem, Session } from "@/lib/types";

interface Store {
  me: Me;
  members: Member[];
  orgCreatedBy: string | null;
  sessions: Session[];
  sessionsTruncated: boolean;
  notes: Note[];
  retractions: Retraction[];
  invites: Invite[];
  rubrics: RubricItem[];
  refreshNotes: () => Promise<void>;
  refreshInvites: () => Promise<void>;
  refreshRubrics: () => Promise<void>;
  refreshCore: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("store not ready");
  return s;
};

// Newest-first cap the server clamps at; we surface it so a >500-session cohort
// doesn't silently lose history (see sessionsTruncated).
const SESSION_LIMIT = 500;

export async function loadAll(me: Me): Promise<Omit<Store, "refreshNotes" | "refreshInvites" | "refreshRubrics" | "refreshCore">> {
  if (!me.org || me.org.role !== "admin") {
    throw new Error("This account is not a Mentor of any program.");
  }
  const org = me.org.orgId;
  const [members, sessions, notes, retractions, invites, rubrics] = await Promise.all([
    api<{ members: Member[]; createdBy: string | null }>(`/v1/orgs/${org}/members`),
    api<{ sessions: Session[] }>(`/v1/orgs/${org}/sessions?limit=${SESSION_LIMIT}`),
    api<{ notes: Note[] }>(`/v1/orgs/${org}/notes?limit=500`),
    api<{ retractions: Retraction[] }>(`/v1/orgs/${org}/retractions?limit=500`),
    api<{ invites: Invite[] }>(`/v1/orgs/${org}/invites`),
    publicApi<{ rubrics: RubricItem[] }>("/v1/rubrics"),
  ]);
  return {
    me,
    members: members.members,
    orgCreatedBy: members.createdBy ?? null,
    sessions: sessions.sessions,
    sessionsTruncated: sessions.sessions.length >= SESSION_LIMIT,
    notes: notes.notes,
    retractions: retractions.retractions,
    invites: invites.invites,
    rubrics: rubrics.rubrics,
  };
}

export function StoreProvider({
  initial,
  children,
}: {
  initial: Awaited<ReturnType<typeof loadAll>>;
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initial);
  const org = data.me.org!.orgId;

  const refreshNotes = useCallback(async () => {
    const r = await api<{ notes: Note[] }>(`/v1/orgs/${org}/notes?limit=500`);
    setData((d) => ({ ...d, notes: r.notes }));
  }, [org]);

  const refreshInvites = useCallback(async () => {
    const r = await api<{ invites: Invite[] }>(`/v1/orgs/${org}/invites`);
    setData((d) => ({ ...d, invites: r.invites }));
  }, [org]);

  const refreshRubrics = useCallback(async () => {
    const r = await publicApi<{ rubrics: RubricItem[] }>("/v1/rubrics");
    setData((d) => ({ ...d, rubrics: r.rubrics }));
  }, []);

  // The live-changing data: roster, shared sessions, retractions. (Rubrics and
  // invites change rarely and have their own refreshers.)
  const refreshCore = useCallback(async () => {
    const [members, sessions, retractions] = await Promise.all([
      api<{ members: Member[]; createdBy: string | null }>(`/v1/orgs/${org}/members`),
      api<{ sessions: Session[] }>(`/v1/orgs/${org}/sessions?limit=${SESSION_LIMIT}`),
      api<{ retractions: Retraction[] }>(`/v1/orgs/${org}/retractions?limit=500`),
    ]);
    setData((d) => ({
      ...d,
      members: members.members,
      orgCreatedBy: members.createdBy ?? d.orgCreatedBy,
      sessions: sessions.sessions,
      sessionsTruncated: sessions.sessions.length >= SESSION_LIMIT,
      retractions: retractions.retractions,
    }));
  }, [org]);

  // Keep the dashboard live: a trainee's new message/share must appear without a
  // manual reload. Chat is a conversation, so notes poll fast (8s); sessions and
  // the roster change rarely, so they ride every 4th tick (~32s). Both also
  // refetch immediately when the tab regains focus. Errors are swallowed — a
  // transient failure just retries next tick; it never blanks the screen.
  const refreshRef = useRef({ refreshNotes, refreshCore });
  refreshRef.current = { refreshNotes, refreshCore };
  useEffect(() => {
    let ticks = 0;
    const tick = (force = false) => {
      if (document.visibilityState !== "visible") return;
      void refreshRef.current.refreshNotes().catch(() => {});
      if (force || ticks % 4 === 0) void refreshRef.current.refreshCore().catch(() => {});
      ticks += 1;
    };
    const onFocus = () => tick(true);
    const id = window.setInterval(() => tick(), 8_000);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <Ctx.Provider value={{ ...data, refreshNotes, refreshInvites, refreshRubrics, refreshCore }}>
      {children}
    </Ctx.Provider>
  );
}

// Shared selectors (chronological session order = oldest first).
export const sessionsOf = (sessions: Session[], uid: string) =>
  sessions
    .filter((s) => s.uid === uid)
    .sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));

export const memberName = (m: Member) => m.displayName || m.email || m.uid;

// Mentor's per-trainee "last opened the chat" timestamp. Client-side only, like
// the app's unread badge — the server stores no read receipts.
const chatSeenKey = (uid: string) => `ma-chat-seen-${uid}`;
export const getChatSeen = (uid: string): string => localStorage.getItem(chatSeenKey(uid)) ?? "";
export const markChatSeen = (uid: string) =>
  localStorage.setItem(chatSeenKey(uid), new Date().toISOString());

// Timestamp of the newest TRAINEE-authored message (root or reply) in a
// trainee's thread — drives the People-page "new reply" dot.
export const latestTraineeMessageAt = (notes: Note[], uid: string): string => {
  let latest = "";
  for (const n of notes) {
    if (n.traineeUid !== uid) continue;
    if (n.authorRole === "trainee" && (n.createdAt ?? "") > latest) latest = n.createdAt ?? "";
    for (const r of n.replies) {
      if (r.authorRole === "trainee" && (r.createdAt ?? "") > latest) latest = r.createdAt ?? "";
    }
  }
  return latest;
};
export const hasUnreadFromTrainee = (notes: Note[], uid: string): boolean => {
  const latest = latestTraineeMessageAt(notes, uid);
  return latest !== "" && latest > getChatSeen(uid);
};
