import React, { createContext, useCallback, useContext, useState } from "react";
import { api, publicApi } from "@/lib/api";
import type { Invite, Me, Member, Note, Retraction, RubricItem, Session } from "@/lib/types";

interface Store {
  me: Me;
  members: Member[];
  sessions: Session[];
  notes: Note[];
  retractions: Retraction[];
  invites: Invite[];
  rubrics: RubricItem[];
  refreshNotes: () => Promise<void>;
  refreshInvites: () => Promise<void>;
  refreshRubrics: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("store not ready");
  return s;
};

export async function loadAll(me: Me): Promise<Omit<Store, "refreshNotes" | "refreshInvites" | "refreshRubrics">> {
  if (!me.org || me.org.role !== "admin") {
    throw new Error("This account is not a Mentor of any program.");
  }
  const org = me.org.orgId;
  const [members, sessions, notes, retractions, invites, rubrics] = await Promise.all([
    api<{ members: Member[] }>(`/v1/orgs/${org}/members`),
    api<{ sessions: Session[] }>(`/v1/orgs/${org}/sessions?limit=500`),
    api<{ notes: Note[] }>(`/v1/orgs/${org}/notes?limit=500`),
    api<{ retractions: Retraction[] }>(`/v1/orgs/${org}/retractions?limit=500`),
    api<{ invites: Invite[] }>(`/v1/orgs/${org}/invites`),
    publicApi<{ rubrics: RubricItem[] }>("/v1/rubrics"),
  ]);
  return {
    me,
    members: members.members,
    sessions: sessions.sessions,
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

  return (
    <Ctx.Provider value={{ ...data, refreshNotes, refreshInvites, refreshRubrics }}>
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
