import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { fmtDay } from "@/lib/scoring";
import { useStore } from "@/store";
import type { Rubric } from "@/lib/types";

export function Rubrics() {
  const { rubrics } = useStore();
  return (
    <Card>
      <CardTitle>Rubrics</CardTitle>
      <p className="mb-3 text-sm text-muted">Edits reach trainees' phones on their next fetch.</p>
      <div className="divide-y divide-line">
        {rubrics.map((r) => (
          <Link
            key={r.id}
            to={`/rubrics/${r.id}`}
            className="flex flex-wrap items-center gap-3 py-2.5 hover:text-brand-indigo"
          >
            <span className="font-medium">{r.rubric.name}</span>
            <span className="text-sm text-muted">
              {r.id} · v{r.version} · {r.rubric.criteria.length} criteria · updated{" "}
              {fmtDay(r.updatedAt)}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export function RubricEditor() {
  const { rubricId = "" } = useParams();
  const { rubrics, refreshRubrics } = useStore();
  const navigate = useNavigate();
  const item = rubrics.find((r) => r.id === rubricId);
  const [draft, setDraft] = useState<Rubric | null>(() =>
    item ? (structuredClone(item.rubric) as Rubric) : null,
  );
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState(() => (item ? JSON.stringify(item.rubric, null, 2) : ""));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!item || !draft) {
    return (
      <Card>
        <p>
          Unknown rubric.{" "}
          <Link to="/rubrics" className="text-brand-indigo underline">
            Back to rubrics
          </Link>
        </p>
      </Card>
    );
  }

  const set = (fn: (r: Rubric) => void) =>
    setDraft((d) => {
      const next = structuredClone(d!) as Rubric;
      fn(next);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = rawMode ? (JSON.parse(raw) as Rubric) : draft;
      const out = await api<{ version: string }>(`/v1/rubrics/${rubricId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await refreshRubrics();
      setMsg({ ok: true, text: `Saved v${out.version}. Phones see it on their next fetch.` });
    } catch (e) {
      setMsg({
        ok: false,
        text:
          e instanceof ApiError && e.status === 409
            ? "Version must change on any edit — bump it and save again."
            : e instanceof Error
              ? `Save failed: ${e.message}`
              : "Save failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        className="cursor-pointer text-sm text-brand-indigo hover:underline"
        onClick={() => navigate("/rubrics")}
      >
        ← Rubrics
      </button>
      <Card>
        <CardTitle>Edit: {draft.name}</CardTitle>
        <div className="space-y-3">
          <label className="block text-sm text-muted">
            Name
            <Input value={draft.name} onChange={(e) => set((r) => (r.name = e.target.value))} />
          </label>
          <label className="block text-sm text-muted">
            Version — must be changed to save (current: {item.version})
            <Input
              value={draft.version}
              onChange={(e) => set((r) => (r.version = e.target.value))}
              className="max-w-56"
            />
          </label>
          <h3 className="pt-2 font-semibold">Dimensions</h3>
          {draft.dimensions.map((d, i) => (
            <label key={d.id} className="block text-sm text-muted">
              “{d.id}” label
              <Input
                value={d.label}
                onChange={(e) => set((r) => (r.dimensions[i].label = e.target.value))}
              />
            </label>
          ))}
          <h3 className="pt-2 font-semibold">Criteria ({draft.criteria.length})</h3>
          {draft.criteria.map((c, i) => (
            <div key={c.id} className="border-t border-dashed border-line pt-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                {c.id} · {c.dimension} · weight
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={c.weight}
                  onChange={(e) => set((r) => (r.criteria[i].weight = Number(e.target.value)))}
                  className="w-20"
                />
              </div>
              <label className="mt-1 block text-sm text-muted">
                Prompt
                <Textarea
                  rows={2}
                  value={c.prompt}
                  onChange={(e) => set((r) => (r.criteria[i].prompt = e.target.value))}
                />
              </label>
              <label className="mt-1 block text-sm text-muted">
                What good looks like
                <Textarea
                  rows={2}
                  value={c.whatGoodLooksLike ?? ""}
                  onChange={(e) =>
                    set((r) => {
                      const v = e.target.value;
                      if (v) r.criteria[i].whatGoodLooksLike = v;
                      else delete r.criteria[i].whatGoodLooksLike;
                    })
                  }
                />
              </label>
            </div>
          ))}
          <details
            onToggle={(e) => setRawMode((e.target as HTMLDetailsElement).open)}
            className="pt-2"
          >
            <summary className="cursor-pointer text-sm text-muted">
              Advanced: raw JSON (overrides the fields above while open)
            </summary>
            <Textarea rows={16} value={raw} onChange={(e) => setRaw(e.target.value)} className="mt-2 font-mono text-xs" />
          </details>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save rubric"}
            </Button>
            {msg && (
              <span className={msg.ok ? "text-sm text-band-high" : "text-sm text-band-low"}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
