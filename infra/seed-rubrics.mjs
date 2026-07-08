#!/usr/bin/env node
// Seed Firestore `rubrics` collection from the iOS repo's rubric JSONs (MC1).
//
// Usage: node infra/seed-rubrics.mjs dev|prod [rubricsDir]
//
// Doc ID = rubric.id, doc content = the pristine rubric document (see
// PLAN.md MC1 Interface). Auth: gcloud access token from the `medadvisor`
// configuration — no key files, no interactive ADC needed.

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const PROJECTS = { dev: "medadvisor-dev", prod: "medadvisor-production" };

const env = process.argv[2];
const project = PROJECTS[env];
if (!project) {
  console.error("usage: seed-rubrics.mjs dev|prod [rubricsDir]");
  process.exit(1);
}
const rubricsDir = process.argv[3] ?? join(homedir(), "bilal-dev/medadvisor/rubrics");

// JS value → Firestore REST typed value
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  throw new Error(`unsupported value type: ${typeof v}`);
}
const toFields = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));

const token = execFileSync("gcloud", ["auth", "print-access-token"], {
  env: { ...process.env, CLOUDSDK_ACTIVE_CONFIG_NAME: "medadvisor" },
  encoding: "utf8",
}).trim();

const files = readdirSync(rubricsDir).filter(
  (f) => f.endsWith(".json") && !f.endsWith(".schema.json"),
);
if (files.length === 0) {
  console.error(`no rubric JSONs found in ${rubricsDir}`);
  process.exit(1);
}

for (const file of files) {
  const rubric = JSON.parse(readFileSync(join(rubricsDir, file), "utf8"));
  if (!rubric.id || !rubric.version) {
    console.error(`SKIP ${file}: missing id or version`);
    continue;
  }
  // PATCH without updateMask replaces the whole document (idempotent seed).
  const url =
    `https://firestore.googleapis.com/v1/projects/${project}` +
    `/databases/(default)/documents/rubrics/${rubric.id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(rubric) }),
  });
  if (!res.ok) {
    console.error(`FAIL ${file} → ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log(`seeded ${project}/rubrics/${rubric.id} (v${rubric.version}) from ${file}`);
}
