// MedAdvisor mentor dashboard (MC4 v1). Vanilla ES modules, no build step.
// Data: /v1/me, /v1/orgs/:id/members, /v1/orgs/:id/sessions, /v1/rubrics (+PUT).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const cfg = await fetch("/v1/client-config").then((r) => r.json());
const auth = getAuth(initializeApp(cfg));

const state = { me: null, members: [], sessions: [], rubrics: [] };

async function api(path, opts = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.detail ?? body.error ?? res.status), { body, status: res.status });
  return body;
}

// ---------- scoring ----------
const RESULT_SCORE = { met: 1, partial: 0.5, missed: 0 };

function dimensionScores(session) {
  const per = {};
  for (const c of session.criteria) {
    if (c.result === "na") continue;
    (per[c.dimension] ??= []).push(RESULT_SCORE[c.result] ?? 0);
  }
  return Object.fromEntries(Object.entries(per).map(([d, arr]) => [d, arr.reduce((a, b) => a + b, 0) / arr.length]));
}
const overallScore = (session) => {
  const v = Object.values(dimensionScores(session));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

function spark(values, w = 110, h = 26) {
  const pts = values.filter((v) => v != null);
  if (pts.length === 0) return '<span class="muted">no data</span>';
  if (pts.length === 1) pts.push(pts[0]);
  const step = (w - 6) / (pts.length - 1);
  const line = pts.map((v, i) => `${(3 + i * step).toFixed(1)},${(h - 3 - v * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${line}" fill="none" stroke="#1a73e8" stroke-width="2"/>
    <circle cx="${(3 + (pts.length - 1) * step).toFixed(1)}" cy="${(h - 3 - pts.at(-1) * (h - 6)).toFixed(1)}" r="2.6" fill="#1a73e8"/>
  </svg>`;
}

// ---------- data ----------
async function loadAll() {
  const me = await api("/v1/me");
  if (!me.org || me.org.role !== "admin") throw new Error("This account is not an org admin.");
  state.me = me;
  const [members, sessions, rubrics] = await Promise.all([
    api(`/v1/orgs/${me.org.orgId}/members`),
    api(`/v1/orgs/${me.org.orgId}/sessions?limit=500`),
    fetch("/v1/rubrics").then((r) => r.json()),
  ]);
  state.members = members.members;
  state.sessions = sessions.sessions;
  state.rubrics = rubrics.rubrics;
}

const sessionsOf = (uid) =>
  state.sessions.filter((s) => s.uid === uid).sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));
const rubricDoc = (id) => state.rubrics.find((r) => r.id === id)?.rubric;
const memberName = (m) => m.displayName || m.email || m.uid;

// ---------- views ----------
function viewCohort() {
  const rows = state.members.map((m) => {
    const ss = sessionsOf(m.uid);
    const last = ss.at(-1)?.recordedAt?.slice(0, 10) ?? "—";
    return `<tr class="click" onclick="location.hash='#trainee/${esc(m.uid)}'">
      <td>${esc(memberName(m))}</td>
      <td><span class="badge role">${esc(m.role)}</span></td>
      <td>${ss.length}</td><td>${last}</td>
      <td>${spark(ss.map(overallScore))}</td></tr>`;
  }).join("");
  return `<h2>${esc(state.me.org.name)} — cohort</h2>
    <table><thead><tr><th>Member</th><th>Role</th><th>Sessions</th><th>Last shared</th><th>Trend</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">no members yet</td></tr>'}</tbody></table>`;
}

function viewTrainee(uid) {
  const m = state.members.find((x) => x.uid === uid);
  if (!m) return '<p>Unknown member. <a href="#cohort">Back</a></p>';
  const ss = sessionsOf(uid);
  const latestRubric = ss.length ? rubricDoc(ss.at(-1).rubricId) : null;
  const dims = latestRubric?.dimensions ?? [];
  const dimLabel = (id) => dims.find((d) => d.id === id)?.label ?? id;

  const trendCells = dims.map((d) => {
    const series = ss.map((s) => dimensionScores(s)[d.id] ?? null);
    const latest = [...series].reverse().find((v) => v != null);
    return `<div class="dimcell"><div class="muted">${esc(d.label)}</div>${spark(series)}
      <div>${pct(latest)}</div></div>`;
  }).join("");

  const cards = [...ss].reverse().map((s) => {
    const rub = rubricDoc(s.rubricId);
    const promptOf = (cid) => rub?.criteria?.find((c) => c.id === cid)?.prompt ?? cid;
    const byDim = {};
    for (const c of s.criteria) (byDim[c.dimension] ??= []).push(c);
    const groups = Object.entries(byDim).map(([d, cs]) => `
      <div><strong>${esc(dimLabel(d))}</strong>${cs.map((c) => `
        <div style="margin:.3rem 0 .3rem .5rem">
          <span class="badge ${esc(c.result)}">${esc(c.result)}</span> ${esc(promptOf(c.id))}
          ${c.evidence ? `<div class="quote">“${esc(c.evidence)}”</div>` : ""}
          ${c.tip ? `<div class="tip">💡 ${esc(c.tip)}</div>` : ""}
        </div>`).join("")}
      </div>`).join("");
    return `<div class="card">
      <div><strong>${esc(s.recordedAt?.slice(0, 10) ?? "?")}</strong>
        <span class="muted">· ${esc(s.location ?? "")} · ${esc(s.rubricId)} v${esc(s.rubricVersion)}
        · overall ${pct(overallScore(s))}</span></div>
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
      <details><summary class="muted">criteria (${s.criteria.length})</summary>${groups}</details>
    </div>`;
  }).join("");

  return `<p><a href="#cohort">← cohort</a></p>
    <h2>${esc(memberName(m))} <span class="badge role">${esc(m.role)}</span></h2>
    <div class="dimrow">${trendCells || '<span class="muted">no sessions yet</span>'}</div>
    ${cards || '<p class="muted">No shared sessions.</p>'}`;
}

function viewRubrics() {
  const rows = state.rubrics.map((r) => `<tr class="click" onclick="location.hash='#rubric/${esc(r.id)}'">
    <td>${esc(r.rubric.name)}</td><td>${esc(r.id)}</td><td>${esc(r.version)}</td>
    <td>${esc(r.updatedAt?.slice(0, 10))}</td><td>${r.rubric.criteria.length}</td></tr>`).join("");
  return `<h2>Rubrics <span class="muted">(edits reach phones on their next fetch)</span></h2>
    <table><thead><tr><th>Name</th><th>id</th><th>Version</th><th>Updated</th><th>Criteria</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function viewRubricEditor(id) {
  const item = state.rubrics.find((r) => r.id === id);
  if (!item) return '<p>Unknown rubric. <a href="#rubrics">Back</a></p>';
  const r = structuredClone(item.rubric);
  const dimFields = r.dimensions.map((d, i) => `
    <label class="f">dimension “${esc(d.id)}” label
      <input data-dim="${i}" value="${esc(d.label)}" style="width:100%"></label>`).join("");
  const critFields = r.criteria.map((c, i) => `
    <div class="crit-edit">
      <div class="muted">${esc(c.id)} · ${esc(c.dimension)} · weight
        <input data-crit-weight="${i}" type="number" min="0" step="0.5" value="${c.weight}" style="width:5rem"></div>
      <label class="f">prompt<textarea data-crit-prompt="${i}" rows="2">${esc(c.prompt)}</textarea></label>
      <label class="f">what good looks like
        <textarea data-crit-wgll="${i}" rows="2">${esc(c.whatGoodLooksLike ?? "")}</textarea></label>
    </div>`).join("");

  setTimeout(() => {
    $("save").onclick = async () => {
      $("savemsg").textContent = ""; $("savemsg").className = "";
      try {
        let updated;
        const rawEl = $("rawjson");
        if (rawEl.dataset.touched === "1") {
          updated = JSON.parse(rawEl.value);
        } else {
          updated = structuredClone(r);
          updated.name = $("rname").value.trim();
          updated.version = $("rversion").value.trim();
          document.querySelectorAll("[data-dim]").forEach((el) => { updated.dimensions[+el.dataset.dim].label = el.value.trim(); });
          document.querySelectorAll("[data-crit-prompt]").forEach((el) => { updated.criteria[+el.dataset.critPrompt].prompt = el.value.trim(); });
          document.querySelectorAll("[data-crit-weight]").forEach((el) => { updated.criteria[+el.dataset.critWeight].weight = Number(el.value); });
          document.querySelectorAll("[data-crit-wgll]").forEach((el) => {
            const v = el.value.trim();
            if (v) updated.criteria[+el.dataset.critWgll].whatGoodLooksLike = v;
            else delete updated.criteria[+el.dataset.critWgll].whatGoodLooksLike;
          });
        }
        const out = await api(`/v1/rubrics/${id}`, { method: "PUT", body: JSON.stringify(updated) });
        const fresh = await fetch("/v1/rubrics").then((x) => x.json());
        state.rubrics = fresh.rubrics;
        $("savemsg").className = "ok";
        $("savemsg").textContent = `Saved v${out.version} at ${out.updatedAt}. Phones see it on next fetch.`;
      } catch (e) {
        $("savemsg").textContent = `Save failed: ${e.message}`;
      }
    };
    $("rawjson").addEventListener("input", (e) => { e.target.dataset.touched = "1"; });
  });

  return `<p><a href="#rubrics">← rubrics</a></p>
    <h2>Edit: ${esc(r.name)}</h2>
    <label class="f">name<input id="rname" value="${esc(r.name)}" style="width:100%"></label>
    <label class="f">version — must be changed to save (current: ${esc(r.version)})
      <input id="rversion" value="${esc(r.version)}"></label>
    <h2>Dimensions</h2>${dimFields}
    <h2>Criteria (${r.criteria.length})</h2>${critFields}
    <details class="raw"><summary class="muted">advanced: raw JSON (overrides fields above if edited)</summary>
      <textarea id="rawjson" rows="16">${esc(JSON.stringify(r, null, 2))}</textarea></details>
    <p><button class="primary" id="save">Save rubric</button> <span id="savemsg"></span></p>`;
}

// ---------- router / auth ----------
function render() {
  const h = location.hash || "#cohort";
  const [, page, arg] = h.match(/^#([a-z]+)(?:\/(.+))?$/) ?? [];
  $("view").innerHTML =
    page === "trainee" && arg ? viewTrainee(decodeURIComponent(arg)) :
    page === "rubrics" ? viewRubrics() :
    page === "rubric" && arg ? viewRubricEditor(decodeURIComponent(arg)) :
    viewCohort();
}
window.addEventListener("hashchange", render);

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("status").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value, $("password").value);
  } catch (err) {
    $("status").textContent = err?.code ?? "sign-in failed";
  }
});
$("signout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) { $("app").hidden = true; $("auth").hidden = false; return; }
  try {
    $("status").textContent = "loading…";
    await loadAll();
    $("status").textContent = "";
    $("who").textContent = `${state.me.email} · ${state.me.org.name}`;
    $("auth").hidden = true; $("app").hidden = false;
    render();
  } catch (err) {
    $("status").textContent = err.message;
    await signOut(auth).catch(() => {});
  }
});
