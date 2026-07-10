import { useState } from "react";
import { Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { getAuthOrThrow } from "@/lib/firebase";
import { api, ApiError } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";

export function Account() {
  const { me } = useStore();
  const [arming, setArming] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const emailMatch = confirm.trim().toLowerCase() === (me.email ?? "").toLowerCase();

  const del = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("/v1/me", { method: "DELETE" });
      await signOut(getAuthOrThrow());
      location.reload();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.code === "owner_has_members"
          ? "You own this program and it still has other members. Remove or reassign them (Invite codes / People) before deleting your account."
          : e instanceof Error
            ? e.message
            : "Couldn't delete the account.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/" className="text-sm text-accent hover:underline">
        ← People
      </Link>
      <Card>
        <CardTitle>Account</CardTitle>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Email</dt>
          <dd>{me.email ?? "—"}</dd>
          <dt className="text-muted">Role</dt>
          <dd>Mentor</dd>
          <dt className="text-muted">Program</dt>
          <dd>{me.org!.name}</dd>
        </dl>
      </Card>

      <Card className="border-band-low/40">
        <CardTitle className="text-band-low">Danger zone</CardTitle>
        <p className="mb-3 text-sm text-muted">
          Deleting your account removes your sign-in, your program membership, and the notes and
          replies you've written. This can't be undone.
        </p>
        {!arming ? (
          <Button variant="danger" onClick={() => setArming(true)}>
            Delete account
          </Button>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm text-muted">
              Type your email (<b>{me.email}</b>) to confirm:
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={me.email ?? ""}
                autoComplete="off"
                className="mt-1"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="danger" disabled={!emailMatch || busy} onClick={del}>
                {busy ? "Deleting…" : "Permanently delete"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setArming(false);
                  setConfirm("");
                  setErr("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {err && <p className="mt-3 text-sm text-band-low">{err}</p>}
      </Card>
    </div>
  );
}
