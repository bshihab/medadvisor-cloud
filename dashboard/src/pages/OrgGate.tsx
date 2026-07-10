import { useState } from "react";
import { signOut } from "firebase/auth";
import { getAuthOrThrow } from "@/lib/firebase";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Me } from "@/lib/types";

// Shown to a signed-in account that belongs to no program yet (contract in
// PLAN.md): create a new program (become its Mentor), or join an existing
// one with a Mentor code. Trainee codes belong in the app — we say so.
export function OrgGate({ me }: { me: Me }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "redeem" | null>(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const finish = async () => {
    await getAuthOrThrow().currentUser?.getIdToken(true); // pick up new claims
    location.reload();
  };

  const create = async () => {
    setBusy("create");
    setErr("");
    try {
      await api("/v1/orgs", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      await finish();
    } catch (e) {
      setErr(e instanceof ApiError && e.code === "already_in_org"
        ? "This account already belongs to a program — reload the page."
        : e instanceof Error ? e.message : "Couldn't create the program.");
      setBusy(null);
    }
  };

  const redeem = async () => {
    setBusy("redeem");
    setErr("");
    setInfo("");
    try {
      const out = await api<{ role: string; orgName: string | null }>("/v1/invites/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      if (out.role !== "admin") {
        setInfo(`That code joined you to "${out.orgName}" as a Trainee — trainees use the phone app, not this dashboard.`);
        setBusy(null);
        return;
      }
      await finish();
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404
        ? "That code isn't valid (it may be expired or used up)."
        : e instanceof Error ? e.message : "Couldn't redeem the code.");
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="glass-card w-full max-w-md !rounded-3xl p-8">
        <div className="btn-glow mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-2xl font-bold text-white">
          M
        </div>
        <h1 className="text-center text-xl font-semibold">Welcome to MedAdvisor</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">
          You're signed in as {me.email ?? "your account"}, but you're not part of a program yet.
        </p>

        <div className="rounded-xl bg-inset p-4">
          <h2 className="text-sm font-semibold">Start your own program</h2>
          <p className="mb-2 mt-0.5 text-xs text-muted">
            You become its Mentor and can invite trainees right away.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Program name — e.g. Internal Medicine Residency"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={busy !== null || !name.trim()} onClick={create}>
              {busy === "create" ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>

        <div className="rounded-xl bg-inset p-4">
          <h2 className="text-sm font-semibold">Join an existing program</h2>
          <p className="mb-2 mt-0.5 text-xs text-muted">
            Enter the single-use Mentor code its mentor gave you.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ABCD2345"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono uppercase tracking-widest"
            />
            <Button variant="outline" disabled={busy !== null || !code.trim()} onClick={redeem}>
              {busy === "redeem" ? "Joining…" : "Join"}
            </Button>
          </div>
        </div>

        <p className="mt-3 min-h-5 text-center text-sm text-band-low">{err}</p>
        {info && <p className="text-center text-sm text-muted">{info}</p>}
        <p className="mt-2 text-center">
          <button
            className="cursor-pointer text-xs text-muted underline"
            onClick={() => signOut(getAuthOrThrow())}
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
