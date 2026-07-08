#!/usr/bin/env node
// Deploy infra/firestore.rules to a project (MC2).
// Usage: node infra/deploy-rules.mjs dev|prod
// Auth: gcloud token from the `medadvisor` configuration.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECTS = { dev: "medadvisor-dev", prod: "medadvisor-production" };
const project = PROJECTS[process.argv[2]];
if (!project) {
  console.error("usage: deploy-rules.mjs dev|prod");
  process.exit(1);
}

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "firestore.rules"), "utf8");
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
  return { ok: res.ok, status: res.status, json };
}

const BASE = `https://firebaserules.googleapis.com/v1/projects/${project}`;

const ruleset = await api(`${BASE}/rulesets`, "POST", {
  source: { files: [{ name: "firestore.rules", content: source }] },
});
if (!ruleset.ok) throw new Error(`ruleset create failed: ${JSON.stringify(ruleset.json)}`);
const rulesetName = ruleset.json.name;

const releaseName = `projects/${project}/releases/cloud.firestore`;
let release = await api(`${BASE}/releases/cloud.firestore`, "PATCH", {
  release: { name: releaseName, rulesetName },
});
if (release.status === 404) {
  release = await api(`${BASE}/releases`, "POST", { name: releaseName, rulesetName });
}
if (!release.ok) throw new Error(`release failed: ${JSON.stringify(release.json)}`);
console.log(`firestore rules deployed to ${project} (${rulesetName})`);
