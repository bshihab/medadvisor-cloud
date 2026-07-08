# medadvisor-cloud — CLAUDE.md

Cloud backend + mentor dashboard for **MedAdvisor**, an on-device-AI iOS app that
records a doctor–patient consultation, transcribes and scores it against a
medical educator's rubric — **entirely on the phone** (audio/transcripts never
leave the device; HIPAA posture). This repo adds the cloud layer around that
app: accounts, cloud-hosted rubrics, opt-in sharing of redacted results, and a
web dashboard for the supervising physician.

## The two repos and the two chats

| Repo | What it is | Claude chat that owns it |
|---|---|---|
| `~/bilal-dev/medadvisor` | The iOS app (SwiftUI, llama.cpp + Qwen2.5-7B on-device) | The long-running "iOS" chat |
| `~/bilal-dev/medadvisor-cloud` (this) | Server (Cloud Run), mentor dashboard, infra | **This chat** |

**Coordination rule: `PLAN.md` in this repo is the single source of truth** for
milestones, decisions, and status. Update it when milestones move. Interface
facts the iOS chat needs (endpoint URLs, request/response schemas, auth config)
get written into `PLAN.md` under the milestone, so Bilal can carry them across
chats by pointing at the file.

## Bilal's machine setup (IMPORTANT — read before running anything)

- Bilal talks to Claude Code over **SSH into this Mac mini** (user `captainbit`).
  You are running ON the mini. He is not physically at this machine.
- **This cloud repo is fully developable HERE on the mini**: node, docker,
  gcloud CLI, deploys — run them via Bash in this repo. (Check tools exist
  before assuming; install via brew when missing.)
- The **iOS repo is different**: it's edited on the mini (`~/bilal-dev/medadvisor`)
  but **built ONLY on Bilal's MacBook Air** (`~/dev/medadvisor` — note the
  different path!) via `git pull` + Xcode. Never try to build iOS code on the
  mini; local SourceKit diagnostics for Swift files are noise — trust only the
  Xcode errors Bilal pastes.
- For interactive logins the agent can't do (e.g. `gcloud auth login`), ask
  Bilal to run them by typing `! <command>` in the chat, or run them himself
  in a terminal on the mini/Air.
- **Git identity: `shihabbilal@gmail.com`** (repo-local config already set).
  NEVER commit as rabahshihab@gmail.com (the Claude account email).
- Secrets: never commit `.env`, keys, or service-account JSON (gitignored).
  Real secrets live in GCP Secret Manager. (A Cloudflare R2 token was once
  pasted into chat and had to be revoked — don't repeat that pattern.)

## Product context you need

- **Users:** trainee doctors record consultations; the app scores 16 rubric
  criteria on-device. A **head doctor / speech mentor (admin)** oversees a
  cohort via the web dashboard.
- **Privacy is the product.** The AI never moves to the cloud. What syncs is
  **Tier 2: per-criterion scores + short REDACTED evidence quotes**, and only
  after (a) a second rule-based NER redaction pass on top of the on-device
  LLM redaction (they fail differently), and (b) the trainee **reviews the
  exact content and explicitly confirms "share with mentor"** before upload.
  Full transcripts never sync by default (a per-session opt-in escalation may
  come much later).
- **Real patients are the eventual target** (not just role-play) and the plan
  is to scale to multiple institutions → HIPAA matters: sign Google's BAA, use
  **Identity Platform** (NOT classic Firebase Auth — it's the same service but
  BAA-eligible, and its native multi-tenancy maps to our orgs).
- **Multi-tenant from day one:** every record carries an `orgId`; queries and
  security rules are org-scoped server-side. Org #1 = the director's program
  (the design-partner cohort, on TestFlight now as build 12 / v0.0.5).
- **Login is OPTIONAL in the app** (fully functional offline/anonymous);
  an account unlocks cross-device sync and mentor sharing. Mentor visibility
  requires the trainee to join the org via invite code.
- **Cloud rubrics:** the director updates guidelines from the dashboard;
  phones fetch + cache them (bundled copy as offline fallback). Rubric JSONs
  currently live in the iOS repo at `medadvisor/rubrics/`.
- **Model delivery is already solved, not this repo's problem:** the 4.4 GB
  GGUF downloads from Cloudflare R2 (bucket `medadvisor-models`, public dev
  URL pub-911d7a5254944de984f1c95e6b8ddcdd.r2.dev) with HF fallback.
  Pre-launch TODO parked in PLAN.md: custom domain on that bucket.

## Stack decisions (from Bilal's dad, a cloud expert — treat as settled)

- **GCP Cloud Run** for the server: Docker container, `min-instances=0`,
  low `max-instances` (bill protection). Separate **dev and prod projects**;
  staging later. **Billing budget + alerts on day one.**
- **Firestore** for data, **Secret Manager** for secrets, **Identity
  Platform** for auth (tenants = orgs).
- Rate limiting on the API; deploy prebuilt bundles; keep the dashboard's
  browser bundle small.
- Costs at current scale are ~$0/month (free tiers); Bilal personally owns
  the GCP account.

## Layout

```
PLAN.md        Milestones MC0–MC5 + acceptance tests + status + decisions (SOURCE OF TRUTH)
server/        Cloud Run API (Node/Express, Dockerfile)
dashboard/     Mentor web app (framework picked in MC4)
infra/         GCP runbooks + deploy scripts (no secrets)
```

## Style expectations

- Milestone-based work with independently verifiable acceptance tests (see
  PLAN.md) — Bilal works this way across all his projects.
- He's technical but newer to cloud/infra: explain what commands do, one step
  at a time when walking him through consoles; don't assume GCP fluency.
- Keep it lean. No framework sprawl; smallest thing that ships each milestone.
