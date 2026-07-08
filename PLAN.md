# MedAdvisor Cloud — Plan (SOURCE OF TRUTH)

Update the Status lines as milestones move. Interface facts (URLs, schemas,
auth config) get recorded under their milestone so the iOS chat can consume
them. Decisions log at the bottom.

## Lane split

- **CLOUD lane (this repo / this chat):** MC0, MC1-server, MC2-server, MC4, MC5
- **iOS lane (medadvisor repo / the iOS chat):** MC1-client, MC2-client, MC3
- Sequencing: MC0 → MC1 → MC2 mostly sequential; after MC2 the lanes run in
  parallel (MC3 on iOS, MC4 here).

---

## MC0 — Foundations                                   Status: DONE 2026-07-08
GCP dev + prod projects; billing budget + email alerts; Cloud Run, Firestore,
Secret Manager, Identity Platform enabled; hello-world server deployed.
- [x] GCP projects `medadvisor-dev` + `medadvisor-production` (shihabbilal@gmail.com;
      the ID `medadvisor-prod` was taken globally)
- [x] Billing: account `019BCD-D40BE9-C2BA03`; $10/mo budget per project with
      50/90/100% email alerts (emails go to billing admins = Bilal)
- [x] gcloud on the mini: dedicated config `medadvisor` — never activated
      globally; all commands use `CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor`
- [x] One-command deploy: `infra/deploy.sh dev|prod` (Cloud Build source
      deploy, min 0 / max 2 instances, verifies /health)
- [x] Also done ahead of MC1/MC2: Firestore Native DBs created (us-west1)
      and APIs enabled (run, firestore, secretmanager, identitytoolkit,
      cloudbuild, artifactregistry, billingbudgets) on both projects
- **Accept:** ✅ `/health` → `{"ok":true,...}` verified on both envs (URLs
  under MC1). Budget alert config verified via CLI; the alert *email* only
  fires when spend crosses a threshold — can't be simulated, watch for it.

## MC1 — Cloud rubrics                                 Status: NOT STARTED
Rubrics in Firestore with versioning; public read API; director-editable later
(MC4). iOS fetches on launch, caches, falls back to bundled copy offline.
- CLOUD: [ ] `GET /v1/rubrics` + `GET /v1/rubrics/:id` (versioned payload)
- CLOUD: [ ] seed from `medadvisor/rubrics/*.json`
- iOS:   [ ] fetch on launch → cache → bundled fallback (airplane-mode safe)
- **Accept:** edit a criterion in Firestore → phone shows it without an app
  update; airplane mode still fully works.
- **Interface:**
  base URL dev:  `https://medadvisor-api-743594385075.us-west1.run.app`
  base URL prod: `https://medadvisor-api-597896295002.us-west1.run.app`
  (`GET /health` live on both; `GET /v1/rubrics` returns 501 until MC1)

## MC2 — Accounts & orgs                               Status: NOT STARTED
Identity Platform (email + Sign in with Apple), tenants = orgs, invite codes.
- CLOUD: [ ] Identity Platform config, org/tenant model, invite-code issue/redeem
- CLOUD: [ ] Firestore security rules: all data org-scoped, deny-by-default
- iOS:   [ ] optional login UI; "Join my program" invite-code flow
- DASH:  [ ] admin login page (minimal)
- **Accept:** create org → trainee joins via code on phone → director logs into
  web and sees roster (no session data yet).

## MC3 — Sync with the review gate (iOS lane)          Status: NOT STARTED
Tier-2 sharing: scores + redacted evidence quotes, nothing else.
- [ ] Second-pass rule-based NER redaction (NLTagger + regex) over quotes
- [ ] "Share with mentor" review screen: trainee sees EXACT payload, edits/
      removes quotes, confirms → upload (org-scoped)
- [ ] Cross-device restore of own history when logged in
- **Accept:** shared session appears on dashboard in seconds; a planted patient
  name is caught by NER or visibly removable at the gate; second device
  restores history; nothing uploads without explicit confirm.

## MC4 — Mentor dashboard v1 (cloud lane)              Status: NOT STARTED
- [ ] Cohort view: trainees, session counts, per-dimension trend lines
- [ ] Trainee drill-in: per-session scores + evidence quotes
- [ ] Rubric editor for the director (writes MC1 store, versioned)
- **Accept:** the director completes a real trainee review using only the web.

## MC5 — Hardening                                     Status: NOT STARTED
- [ ] Rate limiting on the API; audit logging
- [ ] Google BAA signed; security-rules review
- [ ] Staging environment; monitoring/alerting
- [ ] Custom domains: dashboard + R2 model bucket (r2.dev is dev-mode)
- **Accept:** security checklist pass; billing caps verified end-to-end.

---

## Decisions log

- 2026-07-08 **Tier 2 sync** (scores + redacted quotes) with Tier-3-grade
  safeguards (second NER pass + trainee review-&-confirm gate). Full
  transcripts never sync by default.
- 2026-07-08 **Identity Platform, not classic Firebase Auth** (HIPAA BAA
  eligibility + native tenants). Real patients + multi-institution scale are
  the target.
- 2026-07-08 **Multi-tenant from day one** — `orgId` on every record,
  org-scoped rules. Org #1 = director's program.
- 2026-07-08 **Login optional** in-app; required only for sync/mentor sharing.
- 2026-07-08 Bilal personally owns the GCP account. Budget alerts mandatory.
- 2026-07-08 Stack per Bilal's dad: Cloud Run (Docker, min 0/low max),
  Firestore, Secret Manager, dev/staging/prod, rate limits, small browser
  bundle, deploy prebuilt bundles.
- 2026-07-08 **Prod project ID is `medadvisor-production`** — `medadvisor-prod`
  was already taken in GCP's global namespace.
- 2026-07-08 **Billing account `019BCD-D40BE9-C2BA03`** ("My Billing Account 1")
  funds both projects; the other account (016647) was at its 5-project link
  quota. Owner: shihabbilal@gmail.com.
- 2026-07-08 **Dedicated gcloud config `medadvisor`** on the mini (the machine
  also serves bithunch/offloadai). Selected per-command via
  `CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor`, never activated globally.
