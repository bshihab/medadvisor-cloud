import express from "express";

// MedAdvisor cloud API — MC0 hello-world. Grows per PLAN.md; keep it lean.
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "medadvisor-api", env: process.env.APP_ENV ?? "unknown" });
});

// MC1 placeholder — real implementation reads versioned rubrics from Firestore.
app.get("/v1/rubrics", (_req, res) => {
  res.status(501).json({ error: "MC1 not implemented yet" });
});

const port = process.env.PORT ?? 8080; // Cloud Run injects PORT
app.listen(port, () => console.log(`medadvisor-api listening on :${port}`));
