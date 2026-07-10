import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ClipboardList, KeyRound, LogOut, Menu, Monitor, Moon, Sun, Users } from "lucide-react";
import { getAuthOrThrow, initAuth } from "./lib/firebase";
import { api } from "./lib/api";
import type { Me } from "./lib/types";
import { loadAll, StoreProvider, useStore } from "./store";
import { Login } from "./pages/Login";
import { OrgGate } from "./pages/OrgGate";
import { People } from "./pages/People";
import { Invites } from "./pages/Invites";
import { PersonLayout, PersonSessions, PersonSummary } from "./pages/Person";
import { PersonChat } from "./pages/PersonChat";
import { Rubrics, RubricEditor } from "./pages/Rubrics";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Avatar } from "./components/Avatar";
import { cn } from "./lib/utils";

// Recharts is the heaviest dep — only the skill-detail route pays for it.
const SkillDetail = lazy(() =>
  import("./pages/SkillDetail").then((m) => ({ default: m.SkillDetail })),
);

function Spinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-muted">
      <div className="text-center">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-accent" />
        {label}
      </div>
    </div>
  );
}

type Theme = "system" | "light" | "dark";
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("ma-theme") as Theme) || "system",
  );
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    localStorage.setItem("ma-theme", theme);
  }, [theme]);
  const Icon = { system: Monitor, light: Sun, dark: Moon }[theme];
  return (
    <button
      title={`Theme: ${theme} (click to change)`}
      onClick={() => setTheme(NEXT_THEME[theme])}
      className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-hoverfill hover:text-ink"
    >
      <Icon size={18} />
    </button>
  );
}

function SideNavItem({
  to,
  end,
  icon: Icon,
  label,
  count,
  collapsed,
}: {
  to: string;
  end?: boolean;
  icon: typeof Users;
  label: string;
  count?: number;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-[11px] rounded-xl py-[9px] text-[14.5px] transition-colors",
          collapsed ? "justify-center px-0" : "px-3",
          isActive
            ? "bg-accent/15 font-semibold text-accent"
            : "font-medium text-muted hover:bg-hoverfill",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className="flex-none" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
          {!collapsed && count != null && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums",
                isActive ? "bg-accent text-white" : "bg-chip text-muted",
              )}
            >
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Shell() {
  const { me, members } = useStore();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("ma-sidebar") === "collapsed",
  );
  useEffect(() => {
    localStorage.setItem("ma-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  // Skill-detail point clicks pass a scroll target through router state;
  // otherwise each route change scrolls the console pane back to the top.
  useEffect(() => {
    const target = (location.state as { scrollTo?: string } | null)?.scrollTo;
    if (target) {
      setTimeout(
        () => document.getElementById(target)?.scrollIntoView({ behavior: "smooth" }),
        80,
      );
    } else {
      mainRef.current?.scrollTo({ top: 0 });
    }
  }, [location]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "glass-side flex flex-none flex-col p-[14px] pt-5 transition-[width] duration-300",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        <div className={cn("flex items-center pb-[18px]", collapsed ? "flex-col gap-3" : "gap-[11px] px-2")}>
          <span className="btn-glow grid h-[34px] w-[34px] flex-none place-items-center rounded-lg bg-accent text-base font-extrabold text-white">
            M
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[16.5px] tracking-[-0.01em]">MedAdvisor</b>
              <small className="mt-px block text-[11.5px] text-muted">Mentor console</small>
            </div>
          )}
          <button
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-hoverfill hover:text-ink"
          >
            <Menu size={18} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto">
          <SideNavItem to="/" end icon={Users} label="People" count={members.length} collapsed={collapsed} />
          <SideNavItem to="/rubrics" icon={ClipboardList} label="Rubrics" collapsed={collapsed} />
          <SideNavItem to="/invites" icon={KeyRound} label="Invite codes" collapsed={collapsed} />
        </nav>
        <div className="mt-auto border-t border-[var(--side-line)] pt-3">
          <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-2 px-0.5")}>
            <Avatar name={me.displayName || me.email || "?"} size={32} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{me.displayName || me.email}</b>
                <small className="block text-[11px] text-muted">Mentor · {me.org!.name}</small>
              </div>
            )}
            <ThemeToggle />
            <button
              title="Sign out"
              onClick={() => signOut(getAuthOrThrow())}
              className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-hoverfill hover:text-ink"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto px-[38px] py-[30px]">
        <div key={location.pathname} className="rise mx-auto max-w-[1080px]">
          <Suspense fallback={<Spinner label="Loading…" />}>
            <Routes>
              <Route path="/" element={<People />} />
              <Route path="/invites" element={<Invites />} />
              <Route path="/person/:uid" element={<PersonLayout />}>
                <Route index element={<PersonSummary />} />
                <Route path="chat" element={<PersonChat />} />
                <Route path="sessions" element={<PersonSessions />} />
              </Route>
              <Route path="/person/:uid/skill/:dimId" element={<SkillDetail />} />
              <Route path="/rubrics" element={<Rubrics />} />
              <Route path="/rubrics/:rubricId" element={<RubricEditor />} />
              <Route path="*" element={<People />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

type Phase =
  | { kind: "boot" }
  | { kind: "signedOut" }
  | { kind: "loading" }
  | { kind: "noOrg"; me: Me }
  | { kind: "traineeAccount" }
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
          const me = await api<Me>("/v1/me");
          if (cancelled) return;
          if (!me.org) return setPhase({ kind: "noOrg", me });
          if (me.org.role !== "admin") return setPhase({ kind: "traineeAccount" });
          const data = await loadAll(me);
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
  if (phase.kind === "noOrg") return <OrgGate me={phase.me} />;
  if (phase.kind === "traineeAccount")
    return (
      <div className="mx-auto max-w-md px-4 pt-24">
        <Card className="text-center">
          <div className="mb-2 text-3xl">📱</div>
          <p className="mb-4">
            This account is a Trainee — trainees use the MedAdvisor iPhone app. This dashboard is
            for Mentors.
          </p>
          <Button variant="outline" onClick={() => signOut(getAuthOrThrow())}>
            Sign out
          </Button>
        </Card>
      </div>
    );
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

