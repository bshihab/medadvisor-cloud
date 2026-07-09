import { useState } from "react";
import { api } from "@/lib/api";
import { fmtDay, roleLabel } from "@/lib/scoring";
import { useStore } from "@/store";
import type { Invite } from "@/lib/types";
import { Card, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Select } from "./ui/input";

const describe = (i: Invite): string => {
  if (i.role === "admin") {
    return `Mentor code · ${i.maxUses === 1 ? "single use" : `${i.maxUses} uses`}${
      i.uses ? " · already used" : ""
    } · expires ${fmtDay(i.expiresAt)}`;
  }
  const left = i.maxUses != null ? i.maxUses - i.uses : "∞";
  return `Trainee code · ${i.maxUses} uses (${left} left) · expires ${fmtDay(i.expiresAt)}`;
};

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

export function InvitesCard() {
  const { me, invites, refreshInvites } = useStore();
  const [role, setRole] = useState<"trainee" | "admin">("trainee");
  const [fresh, setFresh] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardTitle>Invite codes</CardTitle>
      <p className="text-sm text-muted">
        Codes people type in the app under "Join my program". Each code grants ONE role; a code
        isn't used up until someone redeems it.
      </p>
      <div className="mt-2 divide-y divide-line">
        {invites.length === 0 && <p className="py-2 text-sm text-muted">No active codes yet.</p>}
        {invites.map((i) => (
          <div key={i.code} className="flex flex-wrap items-center gap-3 py-2">
            <code className="rounded-md bg-brand-indigo/10 px-2 py-0.5 font-mono text-sm tracking-widest">
              {i.code}
            </code>
            <span
              className={
                i.role === "admin" ? "text-sm font-medium text-brand-purple" : "text-sm text-muted"
              }
            >
              {describe(i)}
            </span>
            <CopyButton code={i.code} />
          </div>
        ))}
      </div>
      <div className="mt-4 border-t-2 border-line pt-3">
        <div className="text-sm font-semibold">Create a new code</div>
        {fresh && (
          <p className="my-2 text-sm text-band-high">
            Created — {roleLabel(fresh.role)} code{" "}
            <code className="rounded-md bg-brand-indigo/10 px-2 py-0.5 font-mono tracking-widest">
              {fresh.code}
            </code>{" "}
            <CopyButton code={fresh.code} /> · expires {fmtDay(fresh.expiresAt)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={role} onChange={(e) => setRole(e.target.value as "trainee" | "admin")}>
            <option value="trainee">Trainee code (50 uses, 30 days)</option>
            <option value="admin">Mentor code (single use)</option>
          </Select>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const created = await api<Invite>(`/v1/orgs/${me.org!.orgId}/invites`, {
                  method: "POST",
                  body: JSON.stringify(role === "admin" ? { role, maxUses: 1 } : { role }),
                });
                setFresh(created);
                await refreshInvites();
              } finally {
                setBusy(false);
              }
            }}
          >
            Create code
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Mentor codes are single-use on purpose: each one grants full access to every trainee's
          shared data, so mint one per mentor and hand it over directly.
        </p>
      </div>
    </Card>
  );
}
