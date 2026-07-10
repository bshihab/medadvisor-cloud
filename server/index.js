import express from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

// MedAdvisor cloud API — MC1 rubrics (public read) + MC2 accounts/orgs.
// Client-facing contracts live in PLAN.md (MC1/MC2 Interface) — keep in sync.
const PROJECT_ID = process.env.PROJECT_ID ?? "medadvisor-dev";
const app = express();
app.disable("x-powered-by");
// Cloud Run's frontend appends the real client IP as the last X-Forwarded-For
// entry; trusting exactly 1 hop makes req.ip that entry (unspoofable).
app.set("trust proxy", 1);
app.use(express.json());

// MC5: rate limiting. Store is per-instance memory — with max-instances=2 the
// effective ceiling is up to 2x the stated numbers, which is fine at our scale.
const limiter = (max, windowMs = 15 * 60_000) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: "rate_limited" }),
  });
app.use(limiter(600));                        // global: 600 / 15 min / IP
app.use("/v1/invites/redeem", limiter(20));   // slow invite-code guessing
app.use("/v1/sessions", limiter(120));
app.use("/v1/orgs", (req, res, next) =>
  req.method === "POST" && req.path === "/" ? limiter(5)(req, res, next) : next());

// MC5: application-level audit log — one structured line per sensitive action,
// picked up by Cloud Logging. Never log payload content (quotes/summaries).
const audit = (req, action, details = {}) =>
  console.log(JSON.stringify({
    severity: "NOTICE",
    type: "audit",
    action,
    uid: req.user?.uid ?? null,
    orgId: req.user?.orgId ?? null,
    ip: req.ip,
    ...details,
  }));

const db = new Firestore({ projectId: PROJECT_ID });
initializeApp({ projectId: PROJECT_ID });

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "medadvisor-api", env: process.env.APP_ENV ?? "unknown" });
});

// ---------- MC1: rubrics (public read) ----------

function toRubricItem(doc) {
  const rubric = doc.data();
  return {
    id: doc.id,
    version: rubric.version ?? null,
    updatedAt: doc.updateTime.toDate().toISOString(),
    rubric,
  };
}

const CACHE = "public, max-age=300";

app.get("/v1/rubrics", async (_req, res, next) => {
  try {
    const snap = await db.collection("rubrics").get();
    const rubrics = snap.docs.map(toRubricItem).sort((a, b) => a.id.localeCompare(b.id));
    res.set("Cache-Control", CACHE);
    res.json({ rubrics, count: rubrics.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/rubrics/:id", async (req, res, next) => {
  try {
    const doc = await db.collection("rubrics").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "not_found" });
    res.set("Cache-Control", CACHE);
    res.json(toRubricItem(doc));
  } catch (err) {
    next(err);
  }
});

// ---------- MC2: auth, orgs, invites ----------

// Firebase ID token → req.user; org/role come from custom claims (set at
// invite redeem; clients force-refresh the token afterwards).
async function requireAuth(req, res, next) {
  const m = (req.get("authorization") ?? "").match(/^Bearer (.+)$/i);
  if (!m) return res.status(401).json({ error: "unauthenticated" });
  try {
    const t = await getAuth().verifyIdToken(m[1]);
    req.user = {
      uid: t.uid,
      email: t.email ?? null,
      displayName: t.name ?? null,
      orgId: t.orgId ?? null,
      role: t.role ?? null,
    };
    next();
  } catch {
    res.status(401).json({ error: "unauthenticated" });
  }
}

function requireOrgAdmin(req, res, next) {
  if (req.user.role !== "admin" || req.user.orgId !== req.params.orgId) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

// No I, O, 0, 1 — codes are read aloud / typed from a whiteboard.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () => [...randomBytes(8)].map((b) => CODE_ALPHABET[b % 32]).join("");

// Self-serve program creation (contract in PLAN.md): any org-less account
// becomes the Mentor of a brand-new, empty program. Joining an EXISTING
// program as mentor still requires a Mentor code — that's the privacy wall.
app.post("/v1/orgs", requireAuth, async (req, res, next) => {
  try {
    if (req.user.orgId) return res.status(409).json({ error: "already_in_org" });
    const name = String(req.body?.name ?? "").trim();
    if (name.length < 1 || name.length > 80) {
      return res.status(400).json({ error: "invalid_body", detail: "name must be 1-80 chars" });
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "program";
    const orgId = `org-${slug}-${randomBytes(3).toString("hex")}`;
    const batch = db.batch();
    batch.create(db.doc(`orgs/${orgId}`), {
      name,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
    });
    batch.create(db.doc(`orgs/${orgId}/members/${req.user.uid}`), {
      role: "admin",
      email: req.user.email,
      displayName: req.user.displayName,
      joinedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    await getAuth().setCustomUserClaims(req.user.uid, { orgId, role: "admin" });
    audit(req, "org.create", { org: orgId, name });
    res.json({ orgId, name, role: "admin" });
  } catch (err) {
    next(err);
  }
});

app.post("/v1/invites/redeem", requireAuth, async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) return res.status(404).json({ error: "invalid_code" });
    const codeRef = db.collection("inviteCodes").doc(code);

    const result = await db.runTransaction(async (tx) => {
      const codeSnap = await tx.get(codeRef);
      if (!codeSnap.exists) return null;
      const c = codeSnap.data();
      // Unknown, inactive, expired, and exhausted are deliberately
      // indistinguishable to the client (don't leak code state).
      if (!c.active) return null;
      if (c.expiresAt && c.expiresAt.toDate() < new Date()) return null;

      const orgRef = db.doc(`orgs/${c.orgId}`);
      const memberRef = orgRef.collection("members").doc(req.user.uid);
      const [orgSnap, memberSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef)]);
      if (!orgSnap.exists) return null;

      const base = { orgId: c.orgId, orgName: orgSnap.get("name") ?? null };
      if (memberSnap.exists) {
        return { ...base, role: memberSnap.get("role"), alreadyMember: true };
      }
      if (c.maxUses && (c.uses ?? 0) >= c.maxUses) return null;

      const role = c.role ?? "trainee";
      tx.create(memberRef, {
        role,
        email: req.user.email,
        displayName: req.user.displayName,
        joinedAt: FieldValue.serverTimestamp(),
      });
      tx.update(codeRef, { uses: FieldValue.increment(1) });
      return { ...base, role, alreadyMember: false };
    });

    if (!result) return res.status(404).json({ error: "invalid_code" });
    if (!result.alreadyMember) {
      await getAuth().setCustomUserClaims(req.user.uid, { orgId: result.orgId, role: result.role });
    }
    audit(req, "invite.redeem", { org: result.orgId, alreadyMember: result.alreadyMember });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/v1/me", requireAuth, async (req, res, next) => {
  try {
    let org = null;
    if (req.user.orgId) {
      const orgSnap = await db.doc(`orgs/${req.user.orgId}`).get();
      org = {
        orgId: req.user.orgId,
        name: orgSnap.exists ? orgSnap.get("name") : null,
        role: req.user.role,
      };
    }
    res.json({ uid: req.user.uid, email: req.user.email, displayName: req.user.displayName, org });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/orgs/:orgId/members", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const snap = await db.collection(`orgs/${req.params.orgId}/members`).get();
    const members = snap.docs.map((d) => {
      const m = d.data();
      return {
        uid: d.id,
        email: m.email ?? null,
        displayName: m.displayName ?? null,
        role: m.role,
        joinedAt: m.joinedAt?.toDate()?.toISOString() ?? null,
      };
    });
    audit(req, "org.members.read", { org: req.params.orgId });
    res.json({ members, count: members.length });
  } catch (err) {
    next(err);
  }
});

app.post("/v1/orgs/:orgId/invites", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const role = req.body?.role ?? "trainee";
    if (!["trainee", "admin"].includes(role)) return res.status(400).json({ error: "bad_role" });
    const maxUses = Math.max(1, Number(req.body?.maxUses ?? 50));
    const expiresDays = Math.max(1, Number(req.body?.expiresDays ?? 30));
    const expiresAt = new Date(Date.now() + expiresDays * 86_400_000);
    const code = genCode();
    await db.collection("inviteCodes").doc(code).create({
      orgId: req.params.orgId,
      role,
      active: true,
      maxUses,
      uses: 0,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });
    audit(req, "invite.create", { org: req.params.orgId, role, maxUses });
    res.json({ code, orgId: req.params.orgId, role, maxUses, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

// ---------- MC3/MC4: shared sessions (Tier-2: scores + redacted quotes) ----------

// Contract in PLAN.md MC3 Interface (SETTLED). Privacy posture: unknown keys
// are rejected everywhere (no transcript field can sneak in), evidence quotes
// are length-capped, and identity is stamped from the token, never the body.
const RESULT_VALUES = new Set(["met", "partial", "missed", "na"]);
const SESSION_KEYS = new Set([
  "clientSessionId", "recordedAt", "location", "rubricId", "rubricVersion", "summary", "criteria",
]);
const CRITERION_KEYS = new Set(["id", "dimension", "result", "evidence", "tip"]);

function sessionBodyError(b) {
  if (typeof b !== "object" || b === null || Array.isArray(b)) return "body must be a JSON object";
  const unknown = Object.keys(b).filter((k) => !SESSION_KEYS.has(k));
  if (unknown.length) return `unknown keys: ${unknown.join(", ")}`;
  if (typeof b.clientSessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(b.clientSessionId))
    return "clientSessionId must match [A-Za-z0-9_-]{1,128}";
  if (typeof b.recordedAt !== "string" || Number.isNaN(Date.parse(b.recordedAt)))
    return "recordedAt must be an ISO-8601 timestamp";
  if (b.location != null && (typeof b.location !== "string" || b.location.length > 200))
    return "location must be a string of at most 200 chars";
  if (typeof b.rubricId !== "string" || !b.rubricId) return "rubricId is required";
  if (typeof b.rubricVersion !== "string" || !b.rubricVersion) return "rubricVersion is required";
  if (b.summary != null && (typeof b.summary !== "string" || b.summary.length > 2000))
    return "summary must be a string of at most 2000 chars";
  if (!Array.isArray(b.criteria) || b.criteria.length < 1 || b.criteria.length > 64)
    return "criteria must be an array of 1-64 items";
  for (const [i, c] of b.criteria.entries()) {
    if (typeof c !== "object" || c === null || Array.isArray(c)) return `criteria[${i}] must be an object`;
    const u = Object.keys(c).filter((k) => !CRITERION_KEYS.has(k));
    if (u.length) return `criteria[${i}] unknown keys: ${u.join(", ")}`;
    if (typeof c.id !== "string" || !c.id) return `criteria[${i}].id is required`;
    if (typeof c.dimension !== "string" || !c.dimension) return `criteria[${i}].dimension is required`;
    if (!RESULT_VALUES.has(c.result)) return `criteria[${i}].result must be met|partial|missed|na`;
    if (c.evidence != null && (typeof c.evidence !== "string" || c.evidence.length > 500))
      return `criteria[${i}].evidence must be a string of at most 500 chars`;
    if (c.tip != null && (typeof c.tip !== "string" || c.tip.length > 500))
      return `criteria[${i}].tip must be a string of at most 500 chars`;
  }
  return null;
}

function toSessionItem(doc) {
  const s = doc.data();
  return {
    sessionId: doc.id,
    uid: s.uid,
    clientSessionId: s.clientSessionId,
    recordedAt: s.recordedAt?.toDate()?.toISOString() ?? null,
    receivedAt: s.receivedAt?.toDate()?.toISOString() ?? null,
    location: s.location ?? null,
    rubricId: s.rubricId,
    rubricVersion: s.rubricVersion,
    summary: s.summary ?? null,
    criteria: s.criteria,
  };
}

const clampLimit = (q) => Math.min(500, Math.max(1, Number.parseInt(q ?? "100", 10) || 100));

app.post("/v1/sessions", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.orgId) return res.status(403).json({ error: "forbidden" });
    const detail = sessionBodyError(req.body);
    if (detail) return res.status(400).json({ error: "invalid_body", detail });
    const b = req.body;
    const sessionId = `${req.user.uid}__${b.clientSessionId}`;
    // set() replaces: re-POST of the same clientSessionId never duplicates,
    // last confirmed payload wins. Re-sharing also clears any retraction
    // marker in the same batch — latest trainee intent wins.
    const upsertBatch = db.batch();
    upsertBatch.delete(db.doc(`orgs/${req.user.orgId}/retractions/${sessionId}`));
    upsertBatch.set(db.doc(`orgs/${req.user.orgId}/sessions/${sessionId}`), {
      uid: req.user.uid,
      orgId: req.user.orgId,
      clientSessionId: b.clientSessionId,
      recordedAt: new Date(b.recordedAt),
      receivedAt: FieldValue.serverTimestamp(),
      location: b.location ?? null,
      rubricId: b.rubricId,
      rubricVersion: b.rubricVersion,
      summary: b.summary ?? null,
      criteria: b.criteria.map((c) => ({
        id: c.id,
        dimension: c.dimension,
        result: c.result,
        evidence: c.evidence ?? null,
        tip: c.tip ?? null,
      })),
    });
    await upsertBatch.commit();
    audit(req, "session.upsert", { sessionId, rubricId: b.rubricId });
    res.json({ sessionId });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/me/sessions", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.orgId) return res.json({ sessions: [], count: 0 });
    const snap = await db
      .collection(`orgs/${req.user.orgId}/sessions`)
      .where("uid", "==", req.user.uid)
      .get();
    // In-memory sort keeps us off composite indexes (per-user volume is small).
    const sessions = snap.docs
      .map(toSessionItem)
      .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""))
      .slice(0, clampLimit(req.query.limit));
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/orgs/:orgId/sessions", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const col = db.collection(`orgs/${req.params.orgId}/sessions`);
    const limit = clampLimit(req.query.limit);
    let docs;
    if (req.query.uid) {
      docs = (await col.where("uid", "==", String(req.query.uid)).get()).docs
        .map(toSessionItem)
        .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""))
        .slice(0, limit);
    } else {
      docs = (await col.orderBy("recordedAt", "desc").limit(limit).get()).docs.map(toSessionItem);
    }
    audit(req, "org.sessions.read", { org: req.params.orgId, uidFilter: req.query.uid ?? null });
    res.json({ sessions: docs, count: docs.length });
  } catch (err) {
    next(err);
  }
});

// ---------- MC6: mentor notes + session delete (contract in PLAN.md) ----------

const NOTE_POST_KEYS = new Set(["traineeUid", "sessionId", "criterionId", "text"]);

function toNoteItem(doc) {
  const n = doc.data();
  return {
    noteId: doc.id,
    sessionId: n.sessionId ?? null,
    criterionId: n.criterionId ?? null,
    parentNoteId: n.parentNoteId ?? null, // internal: stripped from root items
    traineeUid: n.traineeUid,
    authorUid: n.authorUid,
    authorEmail: n.authorEmail ?? null,
    authorDisplayName: n.authorDisplayName ?? null,
    authorRole: n.authorRole ?? "admin", // legacy notes are all mentor-authored
    text: n.text,
    createdAt: n.createdAt?.toDate()?.toISOString() ?? null,
    updatedAt: n.updatedAt?.toDate()?.toISOString() ?? null,
  };
}

// MC8: single-level threads — replies carry parentNoteId and inherit the
// root's traineeUid/sessionId/criterionId, so one filtered query returns
// whole threads. Roots newest-first (limit applies to roots); replies
// chronological inside each root.
function assembleThreads(docs, limit) {
  const items = docs.map(toNoteItem);
  const roots = items.filter((i) => !i.parentNoteId).sort(newestFirst).slice(0, limit);
  const byId = new Map(roots.map((r) => [r.noteId, r]));
  for (const r of roots) { r.replies = []; delete r.parentNoteId; }
  for (const i of items) {
    if (!i.parentNoteId) continue;
    const root = byId.get(i.parentNoteId);
    if (!root) continue; // orphan (cascade already removed root) — drop
    root.replies.push({
      replyId: i.noteId,
      parentNoteId: i.parentNoteId,
      authorUid: i.authorUid,
      authorEmail: i.authorEmail,
      authorDisplayName: i.authorDisplayName,
      authorRole: i.authorRole,
      text: i.text,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    });
  }
  for (const r of roots) r.replies.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return roots;
}

const newestFirst = (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
const noteTextError = (t) =>
  typeof t !== "string" || t.length < 1 || t.length > 4000
    ? "text must be a string of 1-4000 chars" : null;

app.get("/v1/me/notes", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.orgId) return res.json({ notes: [], count: 0 });
    const snap = await db
      .collection(`orgs/${req.user.orgId}/notes`)
      .where("traineeUid", "==", req.user.uid)
      .get();
    const notes = assembleThreads(snap.docs, clampLimit(req.query.limit));
    res.json({ notes, count: notes.length });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/orgs/:orgId/notes", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    let q = db.collection(`orgs/${req.params.orgId}/notes`);
    if (req.query.traineeUid) q = q.where("traineeUid", "==", String(req.query.traineeUid));
    if (req.query.sessionId) q = q.where("sessionId", "==", String(req.query.sessionId));
    const snap = await q.get();
    const notes = assembleThreads(snap.docs, clampLimit(req.query.limit));
    res.json({ notes, count: notes.length });
  } catch (err) {
    next(err);
  }
});

app.post("/v1/orgs/:orgId/notes", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const bad = (detail) => res.status(400).json({ error: "invalid_body", detail });
    if (typeof b !== "object" || b === null || Array.isArray(b)) return bad("body must be a JSON object");
    const unknown = Object.keys(b).filter((k) => !NOTE_POST_KEYS.has(k));
    if (unknown.length) return bad(`unknown keys: ${unknown.join(", ")}`);
    if (typeof b.traineeUid !== "string" || !b.traineeUid) return bad("traineeUid is required");
    if (b.sessionId != null && (typeof b.sessionId !== "string" || !b.sessionId))
      return bad("sessionId must be a non-empty string when present");
    const textErr = noteTextError(b.text);
    if (textErr) return bad(textErr);

    if (b.criterionId != null && (typeof b.criterionId !== "string" || !b.criterionId))
      return bad("criterionId must be a non-empty string when present");
    if (b.criterionId && !b.sessionId) return bad("criterionId requires sessionId");

    const member = await db.doc(`orgs/${req.params.orgId}/members/${b.traineeUid}`).get();
    if (!member.exists) return bad("traineeUid is not a member of this org");
    if (b.sessionId) {
      const sess = await db.doc(`orgs/${req.params.orgId}/sessions/${b.sessionId}`).get();
      if (!sess.exists) return bad("sessionId does not exist in this org");
      if (sess.get("uid") !== b.traineeUid) return bad("session does not belong to traineeUid");
      if (b.criterionId && !(sess.get("criteria") ?? []).some((c) => c.id === b.criterionId))
        return bad("criterionId is not present in that session's criteria");
    }

    const ref = db.collection(`orgs/${req.params.orgId}/notes`).doc();
    await ref.set({
      orgId: req.params.orgId,
      traineeUid: b.traineeUid,
      sessionId: b.sessionId ?? null,
      criterionId: b.criterionId ?? null,
      parentNoteId: null,
      authorUid: req.user.uid,
      authorEmail: req.user.email,
      authorDisplayName: req.user.displayName,
      authorRole: "admin",
      text: b.text,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    audit(req, "note.create", {
      org: req.params.orgId, noteId: ref.id, traineeUid: b.traineeUid,
      sessionId: b.sessionId ?? null, criterionId: b.criterionId ?? null,
    });
    const item = toNoteItem(await ref.get());
    delete item.parentNoteId;
    item.replies = [];
    await sendPushToUser(b.traineeUid, "New note from your mentor", item.text, {
      noteId: item.noteId, sessionId: item.sessionId ?? "", orgId: req.params.orgId,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.patch("/v1/orgs/:orgId/notes/:noteId", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    if (typeof b !== "object" || b === null || Array.isArray(b) ||
        Object.keys(b).some((k) => k !== "text")) {
      return res.status(400).json({ error: "invalid_body", detail: "body must be exactly { text }" });
    }
    const textErr = noteTextError(b.text);
    if (textErr) return res.status(400).json({ error: "invalid_body", detail: textErr });
    const ref = db.doc(`orgs/${req.params.orgId}/notes/${req.params.noteId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.get("parentNoteId")) return res.status(404).json({ error: "not_found" });
    if (snap.get("authorUid") !== req.user.uid) return res.status(403).json({ error: "forbidden" });
    await ref.update({ text: b.text, updatedAt: FieldValue.serverTimestamp() });
    audit(req, "note.update", { org: req.params.orgId, noteId: req.params.noteId });
    const item = toNoteItem(await ref.get());
    delete item.parentNoteId;
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete("/v1/orgs/:orgId/notes/:noteId", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const ref = db.doc(`orgs/${req.params.orgId}/notes/${req.params.noteId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.get("parentNoteId")) return res.status(404).json({ error: "not_found" });
    if (snap.get("authorUid") !== req.user.uid) return res.status(403).json({ error: "forbidden" });
    // MC8: deleting a root note takes its thread with it.
    const replies = await db.collection(`orgs/${req.params.orgId}/notes`)
      .where("parentNoteId", "==", req.params.noteId).get();
    const batch = db.batch();
    replies.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    audit(req, "note.delete", { org: req.params.orgId, noteId: req.params.noteId, cascadedReplies: replies.size });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---------- MC8: threaded replies (contract in PLAN.md) ----------

app.post("/v1/orgs/:orgId/notes/:noteId/replies", requireAuth, async (req, res, next) => {
  try {
    if (req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "forbidden" });
    const b = req.body;
    if (typeof b !== "object" || b === null || Array.isArray(b) ||
        Object.keys(b).some((k) => k !== "text")) {
      return res.status(400).json({ error: "invalid_body", detail: "body must be exactly { text }" });
    }
    const textErr = noteTextError(b.text);
    if (textErr) return res.status(400).json({ error: "invalid_body", detail: textErr });

    const rootSnap = await db.doc(`orgs/${req.params.orgId}/notes/${req.params.noteId}`).get();
    if (!rootSnap.exists) return res.status(404).json({ error: "not_found" });
    const root = rootSnap.data();
    if (root.parentNoteId)
      return res.status(400).json({ error: "invalid_body", detail: "replies attach to the root note (threads are single-level)" });
    const isMentor = req.user.role === "admin";
    if (!isMentor && root.traineeUid !== req.user.uid) return res.status(403).json({ error: "forbidden" });

    const ref = db.collection(`orgs/${req.params.orgId}/notes`).doc();
    await ref.set({
      orgId: req.params.orgId,
      parentNoteId: req.params.noteId,
      // Inherited so filtered reads return whole threads (see PLAN.md):
      traineeUid: root.traineeUid,
      sessionId: root.sessionId ?? null,
      criterionId: root.criterionId ?? null,
      authorUid: req.user.uid,
      authorEmail: req.user.email,
      authorDisplayName: req.user.displayName,
      authorRole: isMentor ? "admin" : "trainee",
      text: b.text,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    audit(req, "note.reply.create", { org: req.params.orgId, noteId: req.params.noteId, replyId: ref.id });

    // Notify the other party (MC7 sender; best-effort).
    const target = isMentor ? root.traineeUid : root.authorUid;
    const title = isMentor ? "Your mentor replied" : "New reply from your trainee";
    await sendPushToUser(target, title, b.text, {
      noteId: req.params.noteId, replyId: ref.id, orgId: req.params.orgId,
    });

    const i = toNoteItem(await ref.get());
    res.json({
      replyId: i.noteId, parentNoteId: i.parentNoteId, authorUid: i.authorUid,
      authorEmail: i.authorEmail, authorDisplayName: i.authorDisplayName,
      authorRole: i.authorRole, text: i.text, createdAt: i.createdAt, updatedAt: i.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

async function loadOwnReply(req, res) {
  const ref = db.doc(`orgs/${req.params.orgId}/notes/${req.params.replyId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("parentNoteId") !== req.params.noteId) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  if (snap.get("authorUid") !== req.user.uid) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return ref;
}

app.patch("/v1/orgs/:orgId/notes/:noteId/replies/:replyId", requireAuth, async (req, res, next) => {
  try {
    if (req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "forbidden" });
    const b = req.body;
    if (typeof b !== "object" || b === null || Array.isArray(b) ||
        Object.keys(b).some((k) => k !== "text")) {
      return res.status(400).json({ error: "invalid_body", detail: "body must be exactly { text }" });
    }
    const textErr = noteTextError(b.text);
    if (textErr) return res.status(400).json({ error: "invalid_body", detail: textErr });
    const ref = await loadOwnReply(req, res);
    if (!ref) return;
    await ref.update({ text: b.text, updatedAt: FieldValue.serverTimestamp() });
    audit(req, "note.reply.update", { org: req.params.orgId, replyId: req.params.replyId });
    const i = toNoteItem(await ref.get());
    res.json({
      replyId: i.noteId, parentNoteId: i.parentNoteId, authorUid: i.authorUid,
      authorEmail: i.authorEmail, authorDisplayName: i.authorDisplayName,
      authorRole: i.authorRole, text: i.text, createdAt: i.createdAt, updatedAt: i.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/v1/orgs/:orgId/notes/:noteId/replies/:replyId", requireAuth, async (req, res, next) => {
  try {
    if (req.user.orgId !== req.params.orgId) return res.status(403).json({ error: "forbidden" });
    const ref = await loadOwnReply(req, res);
    if (!ref) return;
    await ref.delete();
    audit(req, "note.reply.delete", { org: req.params.orgId, replyId: req.params.replyId });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// Owner-only by construction: the doc id embeds the caller's uid, so a
// foreign clientSessionId resolves inside the caller's own namespace → 404.
app.delete("/v1/sessions/:clientSessionId", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.orgId) return res.status(403).json({ error: "forbidden" });
    const sessionId = `${req.user.uid}__${req.params.clientSessionId}`;
    const ref = db.doc(`orgs/${req.user.orgId}/sessions/${sessionId}`);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "not_found" });
    // Cascade: a retracted session leaves nothing behind, including notes.
    const notesSnap = await db
      .collection(`orgs/${req.user.orgId}/notes`)
      .where("sessionId", "==", sessionId)
      .get();
    const batch = db.batch();
    notesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    // Contentless retraction marker (see PLAN.md + decisions log): the
    // mentor timeline may say a session WAS retracted, but nothing
    // rereadable survives. Same atomic batch as the deletion.
    batch.set(db.doc(`orgs/${req.user.orgId}/retractions/${sessionId}`), {
      traineeUid: req.user.uid,
      recordedAt: snap.get("recordedAt") ?? null,
      receivedAt: snap.get("receivedAt") ?? null,
      retractedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    audit(req, "session.delete", { sessionId, cascadedNotes: notesSnap.size });
    res.json({ deleted: true, sessionId });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/orgs/:orgId/retractions", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    let q = db.collection(`orgs/${req.params.orgId}/retractions`);
    if (req.query.uid) q = q.where("traineeUid", "==", String(req.query.uid));
    const snap = await q.get();
    const retractions = snap.docs
      .map((d) => {
        const r = d.data();
        return {
          traineeUid: r.traineeUid,
          recordedAt: r.recordedAt?.toDate()?.toISOString() ?? null,
          receivedAt: r.receivedAt?.toDate()?.toISOString() ?? null,
          retractedAt: r.retractedAt?.toDate()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.retractedAt ?? "").localeCompare(a.retractedAt ?? ""))
      .slice(0, clampLimit(req.query.limit));
    res.json({ retractions, count: retractions.length });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/orgs/:orgId/invites", requireAuth, requireOrgAdmin, async (req, res, next) => {
  try {
    const snap = await db.collection("inviteCodes").where("orgId", "==", req.params.orgId).get();
    const now = new Date();
    const invites = snap.docs
      .filter((d) => d.get("active") && (!d.get("expiresAt") || d.get("expiresAt").toDate() > now))
      .map((d) => ({
        code: d.id,
        role: d.get("role"),
        uses: d.get("uses") ?? 0,
        maxUses: d.get("maxUses") ?? null,
        createdAt: d.get("createdAt")?.toDate()?.toISOString() ?? null,
        expiresAt: d.get("expiresAt")?.toDate()?.toISOString() ?? null,
      }))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    audit(req, "org.invites.read", { org: req.params.orgId });
    res.json({ invites, count: invites.length });
  } catch (err) {
    next(err);
  }
});

// ---------- MC7: push tokens + note push (contract in PLAN.md) ----------

const PUSH_TOKEN_RE = /^[A-Za-z0-9:_-]{10,512}$/;

app.post("/v1/me/push-token", requireAuth, async (req, res, next) => {
  try {
    const token = String(req.body?.token ?? "");
    const platform = String(req.body?.platform ?? "ios");
    if (!PUSH_TOKEN_RE.test(token))
      return res.status(400).json({ error: "invalid_body", detail: "token must match [A-Za-z0-9:_-]{10,512}" });
    if (platform.length > 20)
      return res.status(400).json({ error: "invalid_body", detail: "platform too long" });
    await db.doc(`users/${req.user.uid}/pushTokens/${token}`).set(
      { platform, lastSeenAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    audit(req, "push.token.register", { platform });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete("/v1/me/push-token", requireAuth, async (req, res, next) => {
  try {
    const token = String(req.body?.token ?? "");
    if (!PUSH_TOKEN_RE.test(token))
      return res.status(400).json({ error: "invalid_body", detail: "token must match [A-Za-z0-9:_-]{10,512}" });
    await db.doc(`users/${req.user.uid}/pushTokens/${token}`).delete(); // idempotent
    audit(req, "push.token.remove", {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Best-effort: never throws into the request path; unregistered tokens are
// pruned so the registry self-heals. Awaited before responding because Cloud
// Run throttles CPU after the response is sent. (MC7; MC8 replies reuse it.)
async function sendPushToUser(uid, title, text, data) {
  try {
    const snap = await db.collection(`users/${uid}/pushTokens`).get();
    if (snap.empty) return;
    const raw = text ?? "";
    const body = raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
    const results = await Promise.allSettled(
      snap.docs.map((d) =>
        getMessaging()
          .send({
            token: d.id,
            notification: { title, body },
            data,
            apns: { payload: { aps: { sound: "default" } } },
          })
          .catch(async (err) => {
            if (err?.code === "messaging/registration-token-not-registered") await d.ref.delete();
            throw err;
          }),
      ),
    );
    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log(JSON.stringify({
      severity: "INFO", type: "push", action: "push.send", title,
      uid, sent, tokens: snap.size,
      firstError: results.find((r) => r.status === "rejected")?.reason?.code ?? null,
    }));
  } catch (err) {
    console.error("push send failed (non-fatal):", err?.message ?? err);
  }
}

// ---------- MC4: rubric editor write (admin only; contract in PLAN.md) ----------

function rubricBodyError(b, id) {
  if (typeof b !== "object" || b === null || Array.isArray(b)) return "body must be a JSON object";
  if (b.id !== id) return "body.id must match the URL id";
  if (typeof b.version !== "string" || !b.version) return "version is required (string)";
  if (typeof b.name !== "string" || !b.name) return "name is required";
  if (!Array.isArray(b.dimensions) || b.dimensions.length < 1) return "dimensions must be a non-empty array";
  const dimIds = new Set();
  for (const [i, d] of b.dimensions.entries()) {
    if (typeof d !== "object" || d === null || Array.isArray(d)) return `dimensions[${i}] must be an object`;
    if (typeof d.id !== "string" || !d.id) return `dimensions[${i}].id is required`;
    if (typeof d.label !== "string" || !d.label) return `dimensions[${i}].label is required`;
    dimIds.add(d.id);
  }
  if (!Array.isArray(b.criteria) || b.criteria.length < 1) return "criteria must be a non-empty array";
  for (const [i, c] of b.criteria.entries()) {
    if (typeof c !== "object" || c === null || Array.isArray(c)) return `criteria[${i}] must be an object`;
    if (typeof c.id !== "string" || !c.id) return `criteria[${i}].id is required`;
    if (!dimIds.has(c.dimension)) return `criteria[${i}].dimension must reference a dimension id`;
    if (typeof c.prompt !== "string" || !c.prompt) return `criteria[${i}].prompt is required`;
    if (typeof c.responseType !== "string" || !c.responseType) return `criteria[${i}].responseType is required`;
    if (typeof c.weight !== "number" || c.weight < 0) return `criteria[${i}].weight must be a number >= 0`;
  }
  return null;
}

app.put("/v1/rubrics/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
    const ref = db.collection("rubrics").doc(req.params.id);
    const cur = await ref.get();
    if (!cur.exists) return res.status(404).json({ error: "not_found" });
    const detail = rubricBodyError(req.body, req.params.id);
    if (detail) return res.status(400).json({ error: "invalid_body", detail });
    if (req.body.version === cur.get("version")) {
      return res.status(409).json({ error: "version_conflict", detail: "version must change on any edit" });
    }
    const wr = await ref.set(req.body);
    audit(req, "rubric.update", { rubricId: req.params.id, version: req.body.version });
    res.json({ id: req.params.id, version: req.body.version, updatedAt: wr.writeTime.toDate().toISOString() });
  } catch (err) {
    next(err);
  }
});

// ---------- MC2: minimal admin page (real dashboard is MC4) ----------

app.get("/v1/client-config", (_req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY ?? null,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
  });
});

// public/ is the prebuilt Vite bundle (dashboard/ is the source; deploy.sh
// builds it before every deploy). /admin stays the canonical URL.
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));
app.get("/admin", (_req, res) => {
  res.sendFile(fileURLToPath(new URL("./public/index.html", import.meta.url)));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

const port = process.env.PORT ?? 8080; // Cloud Run injects PORT
app.listen(port, () => console.log(`medadvisor-api listening on :${port}`));
