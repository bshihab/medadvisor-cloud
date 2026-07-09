import { lazy, Suspense, useEffect, useState } from "react";
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getAuthOrThrow, initAuth } from "./lib/firebase";
import { loadAll, StoreProvider, useStore } from "./store";
import { Login } from "./pages/Login";
import { People } from "./pages/People";
import { PersonLayout, PersonSessions, PersonSummary } from "./pages/Person";
import { Rubrics, RubricEditor } from "./pages/Rubrics";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { cn } from "./lib/utils";

// Recharts is the heaviest dep — only the skill-detail route pays for it.
const SkillDetail = lazy(() =>
  import("./pages/SkillDetail").then((m) => ({ default: m.SkillDetail })),
);

function Spinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-muted">
      <div className="text-center">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand-indigo" />
        {label}
      </div>
    </div>
  );
}

function Shell() {
  const { me } = useStore();
  const location = useLocation();
  // Skill-detail point clicks pass a scroll target through router state.
  useEffect(() => {
    const target = (location.state as { scrollTo?: string } | null)?.scrollTo;
    if (target) {
      setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [location]);

  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-sm",
      isActive ? "bg-brand-indigo/15 font-semibold text-brand-indigo" : "hover:bg-brand-indigo/10",
    );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-5">
      <nav className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card px-4 py-2.5 shadow-[0_1px_2px_rgb(30_27_46/0.05),0_8px_24px_-12px_rgb(99_102_241/0.25)]">
        <Link to="/" className="mr-2 flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-blue via-brand-indigo to-brand-purple text-sm text-white">
            M
          </span>
          MedAdvisor
        </Link>
        <NavLink to="/" end className={tab}>
          People
        </NavLink>
        <NavLink to="/rubrics" className={tab}>
          Rubrics
        </NavLink>
        <span className="ml-auto hidden text-xs text-muted sm:inline">
          {me.email} · {me.org!.name} · Mentor
        </span>
        <Button size="sm" variant="outline" onClick={() => signOut(getAuthOrThrow())}>
          Sign out
        </Button>
      </nav>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Routes>
          <Route path="/" element={<People />} />
          <Route path="/person/:uid" element={<PersonLayout />}>
            <Route index element={<PersonSummary />} />
            <Route path="sessions" element={<PersonSessions />} />
          </Route>
          <Route path="/person/:uid/skill/:dimId" element={<SkillDetail />} />
          <Route path="/rubrics" element={<Rubrics />} />
          <Route path="/rubrics/:rubricId" element={<RubricEditor />} />
          <Route path="*" element={<People />} />
        </Routes>
      </Suspense>
    </div>
  );
}

type Phase =
  | { kind: "boot" }
  | { kind: "signedOut" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: Awaited<ReturnType<typeof loadAll>> };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "boot" });

  useEffect(() => {
    let cancelled = false;
    void initAuth().then((auth) =>
      onAuthStateChanged(auth, async (user: User | null) => {
        if (cancelled) return;
        if (!user) return setPhase({ kind: "signedOut" });
        setPhase({ kind: "loading" });
        try {
          const data = await loadAll();
          if (!cancelled) setPhase({ kind: "ready", data });
        } catch (e) {
          if (!cancelled)
            setPhase({
              kind: "error",
              message: e instanceof Error ? e.message : "Couldn't load your program.",
            });
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "boot") return <Spinner label="Loading…" />;
  if (phase.kind === "signedOut") return <Login />;
  if (phase.kind === "loading") return <Spinner label="Loading your program…" />;
  if (phase.kind === "error")
    return (
      <div className="mx-auto max-w-md px-4 pt-24">
        <Card className="text-center">
          <div className="mb-2 text-3xl">⚠️</div>
          <p className="mb-4">{phase.message}</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => location.reload()}>Try again</Button>
            <Button variant="outline" onClick={() => signOut(getAuthOrThrow())}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    );

  return (
    <HashRouter>
      <StoreProvider initial={phase.data}>
        <Shell />
      </StoreProvider>
    </HashRouter>
  );
}
