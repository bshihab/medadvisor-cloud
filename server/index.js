import express from "express";
import { Firestore } from "@google-cloud/firestore";

// MedAdvisor cloud API — MC1: public read API for cloud rubrics.
// Envelope spec lives in PLAN.md under MC1 Interface (SETTLED) — keep in sync.
const app = express();
app.use(express.json());

const db = new Firestore(); // ADC: metadata server on Cloud Run, gcloud locally

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "medadvisor-api", env: process.env.APP_ENV ?? "unknown" });
});

// Firestore doc → API item: doc content is the pristine rubric document;
// version is the rubric's own semver, updatedAt is Firestore's update time
// (auto-bumps on any edit, so cache key = (version, updatedAt)).
function toItem(doc) {
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
    const rubrics = snap.docs.map(toItem).sort((a, b) => a.id.localeCompare(b.id));
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
    res.json(toItem(doc));
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

const port = process.env.PORT ?? 8080; // Cloud Run injects PORT
app.listen(port, () => console.log(`medadvisor-api listening on :${port}`));
