#!/usr/bin/env node
// Bootstrap an org + its first admin + a trainee invite code (MC2).
//
// Usage:
//   node infra/bootstrap-org.mjs dev|prod <orgId> "<Org Name>" <adminEmail> [adminPassword]
//
// Idempotent: re-running updates the org name, reuses the admin account if it
// exists, and mints a NEW trainee invite code each run (codes are cheap).
// If adminPassword is omitted and the user doesn't exist, a random one is
// generated and printed — change it after first login.
// Auth: gcloud token from the `medadvisor` configuration (like seed-rubrics).

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const PROJECTS = { dev: "medadvisor-dev", prod: "medadvisor-production" };
const [env, orgId, orgName, adminEmail, adminPasswordArg] = process.argv.slice(2);
const project = PROJECTS[env];
if (!project || !orgId || !orgName || !adminEmail) {
  console.error('usage: bootstrap-org.mjs dev|prod <orgId> "<Org Name>" <adminEmail> [adminPassword]');
  process.exit(1);
}

const token = execFileSync("gcloud", ["auth", "print-access-token"], {
  env: { ...process.env, CLOUDSDK_ACTIVE_CONFIG_NAME: "medadvisor" },
  encoding: "utf8",
}).trim();

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": project,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const FS = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const IDP = `https://identitytoolkit.googleapis.com/v1/projects/${project}`;

// --- Firestore typed-value helpers (same convention as seed-rubrics.mjs) ---
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  throw new Error(`unsupported: ${typeof v}`);
}
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

// 1. Org document
await api(`${FS}/orgs/${orgId}?updateMask.fieldPaths=name&updateMask.fieldPaths=createdAt`, "PATCH", {
  fields: toFields({ name: orgName, createdAt: new Date() }),
});
console.log(`org ${orgId} ("${orgName}") ready in ${project}`);

// 2. Admin user (find or create), custom claims, membership doc
const lookup = await api(`${IDP}/accounts:lookup`, "POST", { email: [adminEmail] });
let uid = lookup.users?.[0]?.localId;
if (!uid) {
  const password = adminPasswordArg ?? randomBytes(9).toString("base64url");
  const created = await api(`${IDP}/accounts`, "POST", {
    email: adminEmail,
    password,
    emailVerified: false,
  });
  uid = created.localId;
  console.log(`created admin user ${adminEmail} (uid ${uid})`);
  if (!adminPasswordArg) console.log(`TEMP PASSWORD (change after first login): ${password}`);
} else {
  console.log(`admin user ${adminEmail} exists (uid ${uid})`);
  if (adminPasswordArg) console.log("note: user exists — password argument ignored");
}
await api(`${IDP}/accounts:update`, "POST", {
  localId: uid,
  customAttributes: JSON.stringify({ orgId, role: "admin" }),
});
await api(
  `${FS}/orgs/${orgId}/members/${uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=email&updateMask.fieldPaths=joinedAt`,
  "PATCH",
  { fields: toFields({ role: "admin", email: adminEmail, joinedAt: new Date() }) },
);
console.log(`admin claims + membership set for ${adminEmail}`);

// 3. Trainee invite code (30 days, 50 uses)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = [...randomBytes(8)].map((b) => ALPHABET[b % 32]).join("");
await api(`${FS}/inviteCodes?documentId=${code}`, "POST", {
  fields: toFields({
    orgId,
    role: "trainee",
    active: true,
    maxUses: 50,
    uses: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  }),
});
console.log(`trainee invite code (30d, 50 uses): ${code}`);
