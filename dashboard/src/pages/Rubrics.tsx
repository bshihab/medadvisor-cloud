import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { PageHead } from "@/components/PageHead";
import { api, ApiError } from "@/lib/api";
import { fmtDay } from "@/lib/scoring";
import { useStore } from "@/store";
import type { Rubric, RubricCriterion } from "@/lib/types";

export function Rubrics() {
  const { rubrics } = useStore();
  return (
    <div>
      <PageHead
        title="Rubrics"
        sub="What sessions are scored against · edits reach trainees' phones on their next fetch"
      />
      <Card>
        {rubrics.map((r, i) => (
          <Link
            key={r.id}
            to={`/rubrics/${r.id}`}
            className={`flex flex-wrap items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-hoverfill ${
              i > 0 ? "border-t border-rowline" : ""
            }`}
          >
            <span className="text-sm font-semibold">{r.rubric.name}</span>
            <span className="text-sm text-muted">
              v{r.version} · {r.rubric.dimensions.length} skill areas · {r.rubric.criteria.length}{" "}
              criteria · updated {fmtDay(r.updatedAt)}
            </span>
            <span className="ml-auto text-[17px] text-faint">›</span>
          </Link>
        ))}
      </Card>
    </div>
  );
}

/* ---------- editor pieces ---------- */

// Bump the patch component, preserving a "-draft"-style suffix, matching the
// iOS editor's convention ("0.1.0-draft" → "0.1.1-draft"). The old parseInt
// bump turned "0.1.0-draft" into "1" and diverged from the app's scheme.
function bumpVersion(v: string): string {
  const semver = v.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (semver) return `${semver[1]}.${semver[2]}.${Number(semver[3]) + 1}${semver[4]}`;
  const trailing = v.match(/^(.*?)(\d+)$/);
  if (trailing) return `${trailing[1]}${Number(trailing[2]) + 1}`;
  return `${v}.1`;
}

function CriterionEditor({
  crit,
  onChange,
  onRemove,
}: {
  crit: RubricCriterion;
  onChange: (c: RubricCriterion) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-t border-dashed border-rowline py-2.5">
      <div className="flex items-start gap-2.5">
        <Textarea
          rows={1}
          value={crit.prompt}
          placeholder="What should the trainee do? e.g. “Checked understanding (teach-back)”"
          onChange={(e) => onChange({ ...crit, prompt: e.target.value })}
          className="min-h-10 flex-1"
        />
        <Button
          size="sm"
          variant="ghost"
          title="Remove criterion"
          className="flex-none pt-[7px] text-band-low"
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>
      {/* whatGoodLooksLike is a REAL scoring input fed to the on-device model
          (Analysis.swift) — the mentor must be able to edit it here. */}
      <Textarea
        rows={1}
        value={crit.whatGoodLooksLike ?? ""}
        placeholder="What good looks like (guides the AI) — e.g. “States name and role and greets the patient.”"
        onChange={(e) => onChange({ ...crit, whatGoodLooksLike: e.target.value })}
        className="mt-1.5 min-h-9 w-full text-[12.5px] text-muted"
      />
    </div>
  );
}

function DimensionSection({
  label,
  criteria,
  defaultOpen,
  onLabel,
  onCriterion,
  onRemoveCriterion,
  onAddCriterion,
}: {
  label: string;
  criteria: RubricCriterion[];
  defaultOpen: boolean;
  onLabel: (label: string) => void;
  onCriterion: (c: RubricCriterion) => void;
  onRemoveCriterion: (id: string) => void;
  onAddCriterion: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-rowline bg-inset px-3.5 py-1">
      <div className="flex items-center gap-2.5 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          title={open ? "Collapse" : "Expand"}
          className="w-[18px] cursor-pointer text-[13px] text-muted"
        >
          {open ? "▾" : "▸"}
        </button>
        <Input
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          className="h-[34px] max-w-80 font-semibold"
        />
        <span className="ml-auto flex-none text-xs text-muted">
          {criteria.length} criteri{criteria.length === 1 ? "on" : "a"}
        </span>
      </div>
      {open && (
        <div className="pb-2.5">
          {criteria.map((c) => (
            <CriterionEditor
              key={c.id}
              crit={c}
              onChange={onCriterion}
              onRemove={() => onRemoveCriterion(c.id)}
            />
          ))}
          <Button size="sm" variant="outline" className="mt-2" onClick={onAddCriterion}>
            + Add criterion
          </Button>
        </div>
      )}
    </div>
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
  const [raw, setRaw] = useState(() => (item ? JSON.stringify(item.rubric, null, 2) : ""));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!item || !draft) {
    return (
      <Card>
        <p className="text-sm">
          Unknown rubric.{" "}
          <Link to="/rubrics" className="text-accent underline">
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

  // Auto-bump: the user never edits a version field; the server's 409 on an
  // unchanged version stays as a safety net.
  const nextVersion = bumpVersion(item.version);

  const save = async () => {
    if (draft.criteria.some((c) => !c.prompt.trim())) {
      return setMsg({
        ok: false,
        text: "Every criterion needs a prompt — fill in or remove the empty ones.",
      });
    }
    setBusy(true);
    setMsg(null);
    try {
      const body = structuredClone(draft) as Rubric;
      body.version = nextVersion;
      // Drop empty "what good looks like" strings so we don't feed the model a
      // blank "Good looks like:" line.
      for (const c of body.criteria) {
        if (typeof c.whatGoodLooksLike === "string" && !c.whatGoodLooksLike.trim()) {
          delete c.whatGoodLooksLike;
        }
      }
      await api(`/v1/rubrics/${rubricId}`, { method: "PUT", body: JSON.stringify(body) });
      await refreshRubrics();
      setDraft(body);
      setRaw(JSON.stringify(body, null, 2));
      setMsg({ ok: true, text: `Saved as v${nextVersion} — trainees' phones update on their next fetch.` });
    } catch (e) {
      setMsg({
        ok: false,
        text:
          e instanceof ApiError && e.status === 409
            ? "That version already exists — reload and try again."
            : e instanceof Error
              ? `Save failed: ${e.message}`
              : "Save failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const applyRaw = () => {
    try {
      const body = JSON.parse(raw) as Rubric;
      setDraft(body);
      setMsg({ ok: true, text: "JSON applied to the editor — review and Save." });
    } catch {
      setMsg({ ok: false, text: "That isn't valid JSON." });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        className="cursor-pointer self-start text-sm text-accent hover:underline"
        onClick={() => navigate("/rubrics")}
      >
        ← Rubrics
      </button>

      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1 block text-xs text-muted">Rubric name</label>
            <Input
              value={draft.name}
              onChange={(e) => set((r) => (r.name = e.target.value))}
              className="text-[15px] font-semibold"
            />
            <p className="mt-2 text-xs text-muted">
              Currently v{item.version} · saving publishes <b>v{nextVersion}</b> automatically —
              trainees' phones update on their next fetch.
            </p>
          </div>
          <div className="flex flex-none items-center gap-2 pt-[18px]">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : `Save & publish v${nextVersion}`}
            </Button>
          </div>
        </div>
        {msg && (
          <p className={`mt-2.5 text-sm font-medium ${msg.ok ? "text-band-high" : "text-band-low"}`}>
            {msg.text}
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Skill areas &amp; criteria</CardTitle>
        <p className="mb-3.5 text-[12.5px] text-muted">
          Each skill area groups the specific behaviors the AI looks for. The prompt is the
          question; “what good looks like” guides how the AI judges it. All criteria count equally.
        </p>
        <div className="flex flex-col gap-2.5">
          {draft.dimensions.map((d, di) => (
            <DimensionSection
              key={d.id}
              label={d.label}
              defaultOpen={di === 0}
              criteria={draft.criteria.filter((c) => c.dimension === d.id)}
              onLabel={(label) => set((r) => (r.dimensions[di].label = label))}
              onCriterion={(next) =>
                set((r) => {
                  const i = r.criteria.findIndex((c) => c.id === next.id);
                  if (i >= 0) r.criteria[i] = next;
                })
              }
              onRemoveCriterion={(id) =>
                set((r) => (r.criteria = r.criteria.filter((c) => c.id !== id)))
              }
              onAddCriterion={() =>
                set((r) =>
                  r.criteria.push({
                    id: `${d.id}-${Date.now().toString(36)}`,
                    dimension: d.id,
                    weight: 1,
                    prompt: "",
                    // Matches the app's default scoring mode; required by the API.
                    responseType: "boolean_with_evidence",
                  }),
                )
              }
            />
          ))}
        </div>

        <details className="mt-[18px]">
          <summary className="cursor-pointer text-xs text-muted">Advanced · raw JSON</summary>
          <div className="mt-2.5">
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="min-h-60 font-mono text-xs"
            />
            <Button size="sm" variant="outline" className="mt-2" onClick={applyRaw}>
              Apply JSON to editor
            </Button>
          </div>
        </details>
      </Card>
    </div>
  );
}
