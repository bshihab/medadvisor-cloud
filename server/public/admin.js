// MedAdvisor mentor dashboard (MC4.5 redesign + MC6 notes). Vanilla ES
// modules, no build step. Wire roles are admin/trainee; UI says Mentor/Trainee.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const roleLabel = (r) => (r === "admin" ? "Mentor" : "Trainee");
const roleBadge = (r) =>
  `<span class="badge ${r === "admin" ? "mentor" : "trainee"}">${roleLabel(r)}</span>`;
const fmtDay = (iso) => (iso ? iso.slice(0, 10) : "—");

const cfg = await fetch("/v1/client-config").then((r) => r.json());
const auth = getAuth(initializeApp(cfg));

const state = {
  me: null, members: [], sessions: [], notes: [], rubrics: [],
  retractions: [], invites: [], editingNoteId: null, freshCode: null,
};

async function api(path, opts = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.detail ?? body.error ?? `HTTP ${res.status}`), { body, status: res.status });
  return body;
}

// ---------- scoring / sparklines ----------
const RESULT_SCORE = { met: 1, partial: 0.5, missed: 0 };

function dimensionScores(session) {
  const per = {};
  for (const c of session.criteria) {
    if (c.result === "na") continue;
    (per[c.dimension] ??= []).push(RESULT_SCORE[c.result] ?? 0);
  }
  return Object.fromEntries(Object.entries(per).map(([d, arr]) => [d, arr.reduce((a, b) => a + b, 0) / arr.length]));
}
const overallScore = (s) => {
  const v = Object.values(dimensionScores(s));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

// Unified skill-area viz (spec in PLAN.md, SETTLED): band colors + smooth
// trend, identical on trainee Insights, native mentor tab, and here.
const bandColor = (x) => (x < 0.4 ? "#FF3B30" : x < 0.75 ? "#FF9500" : "#34C759");
const bandName = (x) => (x < 0.4 ? "Emerging" : x < 0.75 ? "Developing" : "Proficient");

// Catmull-Rom → bezier smooth sparkline, ~56×20, 2px stroke, colored by the
// latest value's band. Returns empty-space placeholder under 2 points.
function trendLine(values, color, w = 56, h = 20) {
  const pts = values.filter((v) => v != null).map((v, i, arr) => ({
    x: 2 + (i * (w - 4)) / Math.max(1, arr.length - 1),
    y: h - 2 - v * (h - 4),
  }));
  if (pts.length < 2) return `<span style="display:inline-block;width:${w}px"></span>`;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}` +
         ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}` +
         ` ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function spark(values, w = 110, h = 26) {
  const pts = values.filter((v) => v != null);
  if (pts.length === 0) return '<span class="muted">no data</span>';
  if (pts.length === 1) pts.push(pts[0]);
  const step = (w - 6) / (pts.length - 1);
  const line = pts.map((v, i) => `${(3 + i * step).toFixed(1)},${(h - 3 - v * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${line}" fill="none" stroke="var(--indigo)" stroke-width="2"/>
    <circle cx="${(3 + (pts.length - 1) * step).toFixed(1)}" cy="${(h - 3 - pts.at(-1) * (h - 6)).toFixed(1)}" r="2.6" fill="var(--purple)"/>
  </svg>`;
}

// ---------- data ----------
async function loadAll() {
  const me = await api("/v1/me");
  if (!me.org || me.org.role !== "admin") throw new Error("This account is not a Mentor of any program.");
  state.me = me;
  const org = me.org.orgId;
  const [members, sessions, notes, rubrics, retractions, invites] = await Promise.all([
    api(`/v1/orgs/${org}/members`),
    api(`/v1/orgs/${org}/sessions?limit=500`),
    api(`/v1/orgs/${org}/notes?limit=500`),
    fetch("/v1/rubrics").then((r) => r.json()),
    api(`/v1/orgs/${org}/retractions?limit=500`),
    api(`/v1/orgs/${org}/invites`),
  ]);
  state.members = members.members;
  state.sessions = sessions.sessions;
  state.notes = notes.notes;
  state.rubrics = rubrics.rubrics;
  state.retractions = retractions.retractions;
  state.invites = invites.invites;
}

async function refreshNotes() {
  const r = await api(`/v1/orgs/${state.me.org.orgId}/notes?limit=500`);
  state.notes = r.notes;
}

const sessionsOf = (uid) =>
  state.sessions.filter((s) => s.uid === uid).sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));
const notesFor = (uid, sessionId) =>
  state.notes.filter((n) => n.traineeUid === uid && (n.sessionId ?? null) === sessionId);
const rubricDoc = (id) => state.rubrics.find((r) => r.id === id)?.rubric;
const memberName = (m) => m.displayName || m.email || m.uid;

// ---------- shared fragments ----------
const stateBox = (icon, title, sub = "") =>
  `<div class="card"><div class="state"><div class="big">${icon}</div>
   <h3>${esc(title)}</h3><p class="muted">${sub}</p></div></div>`;

function noteHtml(n) {
  const mine = n.authorUid === state.me.uid;
  const when = fmtDay(n.createdAt) + (n.updatedAt !== n.createdAt ? " · edited" : "");
  if (state.editingNoteId === n.noteId) {
    return `<div class="note" data-note="${esc(n.noteId)}">
      <div class="meta">${esc(n.authorEmail ?? "Mentor")} · ${when}</div>
      <div class="composer">
        <textarea id="edit-ta-${esc(n.noteId)}">${esc(n.text)}</textarea>
        <div class="row">
          <button class="primary small" data-action="save-edit" data-id="${esc(n.noteId)}">Save</button>
          <button class="small" data-action="cancel-edit">Cancel</button>
          <span class="err"></span>
        </div>
      </div>
    </div>`;
  }
  return `<div class="note" data-note="${esc(n.noteId)}">
    <div class="meta">${esc(n.authorEmail ?? "Mentor")} · ${when}
      ${mine ? `· <button class="small" data-action="edit-note" data-id="${esc(n.noteId)}">Edit</button>
               <button class="small danger" data-action="del-note" data-id="${esc(n.noteId)}">Delete</button>` : ""}
    </div>
    <div>${esc(n.text)}</div>
  </div>`;
}

function notesBlock(uid, sessionId, title) {
  const items = notesFor(uid, sessionId);
  const ctx = sessionId ?? "general";
  return `<h3 style="font-size:1rem">${esc(title)}</h3>
    ${items.map(noteHtml).join("") || '<p class="muted">No notes yet.</p>'}
    <div class="composer">
      <textarea id="ta-${esc(ctx)}" placeholder="Write a note for the trainee…"></textarea>
      <div class="row">
        <button class="primary small" data-action="add-note" data-uid="${esc(uid)}"
          data-session="${esc(sessionId ?? "")}" data-ctx="${esc(ctx)}">Add note</button>
        <span class="err"></span>
      </div>
    </div>`;
}

// ---------- views ----------
function invitesCard() {
  const rows = state.invites.map((i) => `<tr>
    <td><code>${esc(i.code)}</code></td>
    <td>${roleBadge(i.role)}</td>
    <td>${i.uses}/${i.maxUses ?? "∞"}</td>
    <td>${fmtDay(i.expiresAt)}</td>
    <td><button class="small" data-action="copy-code" data-code="${esc(i.code)}">Copy</button></td>
  </tr>`).join("");
  return `<div class="card">
    <h2 style="font-size:1.05rem">Invite codes</h2>
    ${state.freshCode ? `<p class="ok">New ${esc(roleLabel(state.freshCode.role))} code:
      <code style="font-size:1.1em">${esc(state.freshCode.code)}</code>
      <button class="small" data-action="copy-code" data-code="${esc(state.freshCode.code)}">Copy</button>
      — expires ${fmtDay(state.freshCode.expiresAt)}</p>` : ""}
    ${rows ? `<table><thead><tr><th>Code</th><th>Grants</th><th>Uses</th><th>Expires</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>` : '<p class="muted">No active codes — mint one below.</p>'}
    <div class="composer"><div class="row">
      <select id="invrole" style="width:auto">
        <option value="trainee">Trainee</option>
        <option value="admin">Mentor — full program access</option>
      </select>
      <button class="primary small" data-action="mint-code">New invite code</button>
      <span class="err"></span>
    </div>
    <p class="muted" style="margin:.2rem 0 0">Trainee codes: 50 uses, 30 days.
      Mentor codes grant full access to every trainee's shared data — mint
      single-use, share carefully.</p></div>
  </div>`;
}

function viewCohort() {
  if (state.members.length === 0)
    return stateBox("👋", "No members yet",
      "Mint a trainee invite code below to get people on board.") + invitesCard();
  const rows = state.members.map((m) => {
    const ss = sessionsOf(m.uid);
    return `<tr class="click" onclick="location.hash='#trainee/${esc(m.uid)}'">
      <td>${esc(memberName(m))}</td>
      <td>${roleBadge(m.role)}</td>
      <td>${ss.length}</td><td>${fmtDay(ss.at(-1)?.recordedAt)}</td>
      <td>${spark(ss.map(overallScore))}</td></tr>`;
  }).join("");
  return `<div class="card"><h2>${esc(state.me.org.name)}</h2>
    <p class="muted">Tap a member to see their sessions and notes.</p>
    <table><thead><tr><th>Member</th><th>Role</th><th>Sessions</th><th>Last shared</th><th>Trend</th></tr></thead>
    <tbody>${rows}</tbody></table></div>` + invitesCard();
}

function viewTrainee(uid) {
  const m = state.members.find((x) => x.uid === uid);
  if (!m) return stateBox("🤔", "Unknown member", '<a href="#cohort">Back to cohort</a>');
  const ss = sessionsOf(uid);
  const latestRubric = ss.length ? rubricDoc(ss.at(-1).rubricId) : null;
  const dims = latestRubric?.dimensions ?? [];
  const dimLabel = (id) => dims.find((d) => d.id === id)?.label ?? id;

  // One ROW per skill area: label · bar · percent · trend (spec: PLAN.md
  // "Unified skill-area visualization", SETTLED — mirrored exactly).
  const trendCells = dims.map((d) => {
    const series = ss.map((s) => dimensionScores(s)[d.id] ?? null);
    const latest = [...series].reverse().find((v) => v != null);
    const color = latest != null ? bandColor(latest) : "var(--na)";
    return `<div class="skillrow" title="${latest != null ? esc(bandName(latest)) : ""}">
      <span class="muted">${esc(d.label)}</span>
      <span class="bar"><span style="width:${latest != null ? Math.round(latest * 100) : 0}%;background:${color}"></span></span>
      <span class="pct" style="color:${latest != null ? color : "var(--muted)"}">${pct(latest)}</span>
      ${trendLine(series, color)}
    </div>`;
  }).join("");

  // Timeline = session cards + muted retraction lines, newest first.
  // Retractions are contentless by design (see PLAN.md) — line only, no
  // card, and they never count toward totals or trends.
  const timeline = [
    ...ss.map((s) => ({ type: "session", at: s.recordedAt ?? "", s })),
    ...state.retractions
      .filter((r) => r.traineeUid === uid)
      .map((r) => ({ type: "retraction", at: r.recordedAt ?? "", r })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const cardOf = (s) => {
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
      <div><strong>${fmtDay(s.recordedAt)}</strong>
        <span class="muted">· ${esc(s.location ?? "")} · ${esc(s.rubricId)} v${esc(s.rubricVersion)}
        · overall ${pct(overallScore(s))}</span></div>
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
      <details><summary class="muted">Criteria (${s.criteria.length})</summary>${groups}</details>
      <div style="margin-top:.6rem">${notesBlock(uid, s.sessionId, "Session notes")}</div>
    </div>`;
  };

  const timelineHtml = timeline.map((t) =>
    t.type === "session"
      ? cardOf(t.s)
      : `<p class="muted retraction">A session from ${fmtDay(t.r.recordedAt)} was retracted
         by the trainee on ${fmtDay(t.r.retractedAt)}.</p>`,
  ).join("");

  return `<p><a href="#cohort">← Cohort</a></p>
    <div class="card">
      <h2>${esc(memberName(m))} ${roleBadge(m.role)}</h2>
      ${ss.length ? `<div style="margin-top:.7rem">${trendCells}</div>`
                  : '<p class="muted">No shared sessions yet — trends appear once the trainee shares.</p>'}
    </div>
    <div class="card">${notesBlock(uid, null, "General notes")}</div>
    ${timelineHtml || stateBox("📭", "No shared sessions",
      "Sessions appear here as soon as the trainee shares them from the app.")}`;
}

function viewRubrics() {
  if (state.rubrics.length === 0)
    return stateBox("📋", "No rubrics", "Seed rubrics from the repo to get started.");
  const rows = state.rubrics.map((r) => `<tr class="click" onclick="location.hash='#rubric/${esc(r.id)}'">
    <td>${esc(r.rubric.name)}</td><td>${esc(r.id)}</td><td>${esc(r.version)}</td>
    <td>${fmtDay(r.updatedAt)}</td><td>${r.rubric.criteria.length}</td></tr>`).join("");
  return `<div class="card"><h2>Rubrics</h2>
    <p class="muted">Edits reach trainees' phones on their next fetch.</p>
    <table><thead><tr><th>Name</th><th>id</th><th>Version</th><th>Updated</th><th>Criteria</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function viewRubricEditor(id) {
  const item = state.rubrics.find((r) => r.id === id);
  if (!item) return stateBox("🤔", "Unknown rubric", '<a href="#rubrics">Back to rubrics</a>');
  const r = structuredClone(item.rubric);
  const dimFields = r.dimensions.map((d, i) => `
    <label class="f">Dimension “${esc(d.id)}” label
      <input data-dim="${i}" value="${esc(d.label)}"></label>`).join("");
  const critFields = r.criteria.map((c, i) => `
    <div class="crit-edit">
      <div class="muted">${esc(c.id)} · ${esc(c.dimension)} · weight
        <input data-crit-weight="${i}" type="number" min="0" step="0.5" value="${c.weight}" style="width:5rem"></div>
      <label class="f">Prompt<textarea data-crit-prompt="${i}" rows="2">${esc(c.prompt)}</textarea></label>
      <label class="f">What good looks like
        <textarea data-crit-wgll="${i}" rows="2">${esc(c.whatGoodLooksLike ?? "")}</textarea></label>
    </div>`).join("");

  setTimeout(() => {
    $("save").onclick = async () => {
      const msg = $("savemsg");
      msg.textContent = "Saving…"; msg.className = "muted";
      $("save").disabled = true;
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
        msg.className = "ok";
        msg.textContent = `Saved v${out.version}. Phones see it on their next fetch.`;
      } catch (e) {
        msg.className = "err";
        msg.textContent = e.status === 409
          ? "Version must change on any edit — bump it and save again."
          : `Save failed: ${e.message}`;
      } finally {
        $("save").disabled = false;
      }
    };
    $("rawjson").addEventListener("input", (e) => { e.target.dataset.touched = "1"; });
  });

  return `<p><a href="#rubrics">← Rubrics</a></p>
    <div class="card">
      <h2>Edit: ${esc(r.name)}</h2>
      <label class="f">Name<input id="rname" value="${esc(r.name)}"></label>
      <label class="f">Version — must be changed to save (current: ${esc(r.version)})
        <input id="rversion" value="${esc(r.version)}"></label>
      <h3 style="margin-top:1rem">Dimensions</h3>${dimFields}
      <h3 style="margin-top:1rem">Criteria (${r.criteria.length})</h3>${critFields}
      <details class="raw"><summary class="muted">Advanced: raw JSON (overrides fields above if edited)</summary>
        <textarea id="rawjson" rows="16">${esc(JSON.stringify(r, null, 2))}</textarea></details>
      <p><button class="primary" id="save">Save rubric</button> <span id="savemsg"></span></p>
    </div>`;
}

// ---------- notes actions (event delegation) ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !state.me) return;
  const err = btn.parentElement?.querySelector?.(".err");
  const setErr = (m) => { if (err) err.textContent = m; };
  const org = state.me.org.orgId;
  try {
    if (btn.dataset.action === "add-note") {
      const ta = $(`ta-${btn.dataset.ctx}`);
      const text = ta.value.trim();
      if (!text) return setErr("Write something first.");
      btn.disabled = true;
      const body = { traineeUid: btn.dataset.uid, text };
      if (btn.dataset.session) body.sessionId = btn.dataset.session;
      await api(`/v1/orgs/${org}/notes`, { method: "POST", body: JSON.stringify(body) });
      await refreshNotes(); render();
    } else if (btn.dataset.action === "edit-note") {
      state.editingNoteId = btn.dataset.id; render();
    } else if (btn.dataset.action === "cancel-edit") {
      state.editingNoteId = null; render();
    } else if (btn.dataset.action === "save-edit") {
      const text = $(`edit-ta-${btn.dataset.id}`).value.trim();
      if (!text) return setErr("Note can't be empty.");
      btn.disabled = true;
      await api(`/v1/orgs/${org}/notes/${btn.dataset.id}`, { method: "PATCH", body: JSON.stringify({ text }) });
      state.editingNoteId = null;
      await refreshNotes(); render();
    } else if (btn.dataset.action === "del-note") {
      if (btn.dataset.armed !== "1") {
        btn.dataset.armed = "1"; btn.textContent = "Really delete?"; return;
      }
      btn.disabled = true;
      await api(`/v1/orgs/${org}/notes/${btn.dataset.id}`, { method: "DELETE" });
      await refreshNotes(); render();
    } else if (btn.dataset.action === "mint-code") {
      btn.disabled = true;
      const role = $("invrole").value;
      state.freshCode = await api(`/v1/orgs/${org}/invites`, {
        method: "POST",
        body: JSON.stringify(role === "admin" ? { role, maxUses: 1 } : { role }),
      });
      const fresh = await api(`/v1/orgs/${org}/invites`);
      state.invites = fresh.invites;
      render();
    } else if (btn.dataset.action === "copy-code") {
      await navigator.clipboard.writeText(btn.dataset.code);
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    }
  } catch (ex) {
    btn.disabled = false;
    setErr(ex.message ?? "Something went wrong — try again.");
  }
});

// ---------- router / auth ----------
function render() {
  if (!state.me) return; // signed-out hashchange must not paint views
  const h = location.hash || "#cohort";
  const [, page, arg] = h.match(/^#([a-z]+)(?:\/(.+))?$/) ?? [];
  document.querySelectorAll("nav.top a.tab").forEach((a) => {
    a.classList.toggle("on", a.dataset.tab === (page === "trainee" ? "cohort" : page === "rubric" ? "rubrics" : page ?? "cohort"));
  });
  $("view").innerHTML =
    page === "trainee" && arg ? viewTrainee(decodeURIComponent(arg)) :
    page === "rubrics" ? viewRubrics() :
    page === "rubric" && arg ? viewRubricEditor(decodeURIComponent(arg)) :
    viewCohort();
}
window.addEventListener("hashchange", render);

const LOGIN_ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/too-many-requests": "Too many attempts — wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem — check your connection.",
};

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginerr").textContent = "";
  $("loginbtn").disabled = true;
  $("loginbtn").textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(auth, $("email").value, $("password").value);
  } catch (err) {
    $("loginerr").textContent = LOGIN_ERRORS[err?.code] ?? "Sign-in failed. Please try again.";
  } finally {
    $("loginbtn").disabled = false;
    $("loginbtn").textContent = "Sign in";
  }
});
$("signout").addEventListener("click", () => signOut(auth));

$("googlebtn").addEventListener("click", async () => {
  $("loginerr").textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
    $("loginerr").textContent =
      err?.code === "auth/operation-not-allowed"
        ? "Google sign-in isn't enabled yet for this environment."
        : LOGIN_ERRORS[err?.code] ?? "Google sign-in failed. Please try again.";
  }
});

onAuthStateChanged(auth, async (user) => {
  $("boot").hidden = true;
  if (!user) { $("app").hidden = true; $("auth").hidden = false; return; }
  $("auth").hidden = true;
  $("app").hidden = false;
  $("view").innerHTML = `<div class="card"><div class="state"><div class="spin"></div>Loading your program…</div></div>`;
  try {
    await loadAll();
    $("who").textContent = `${state.me.email} · ${state.me.org.name} · Mentor`;
    render();
  } catch (err) {
    $("view").innerHTML = stateBox("⚠️", err.message ?? "Couldn't load",
      '<button id="retry" class="primary small">Try again</button> or <a href="#" id="outlink">sign out</a>');
    setTimeout(() => {
      $("retry")?.addEventListener("click", () => location.reload());
      $("outlink")?.addEventListener("click", (e2) => { e2.preventDefault(); signOut(auth); });
    });
  }
});
