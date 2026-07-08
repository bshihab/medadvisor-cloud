import express from "express";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// MedAdvisor cloud API — MC1 rubrics (public read) + MC2 accounts/orgs.
// Client-facing contracts live in PLAN.md (MC1/MC2 Interface) — keep in sync.
const PROJECT_ID = process.env.PROJECT_ID ?? "medadvisor-dev";
const app = express();
app.use(express.json());

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
    res.json({ code, orgId: req.params.orgId, role, maxUses, expiresAt: expiresAt.toISOString() });
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

app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));
app.get("/admin", (_req, res) => {
  res.sendFile(fileURLToPath(new URL("./public/admin.html", import.meta.url)));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

const port = process.env.PORT ?? 8080; // Cloud Run injects PORT
app.listen(port, () => console.log(`medadvisor-api listening on :${port}`));
