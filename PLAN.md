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

## MC0 — Foundations                                   Status: NOT STARTED
GCP dev + prod projects; billing budget + email alerts; Cloud Run, Firestore,
Secret Manager, Identity Platform enabled; hello-world server deployed.
- [ ] GCP projects `medadvisor-dev` + `medadvisor-prod` (Bilal's account)
- [ ] Billing budget with alert emails on both (e.g. alert $10, cap review $50)
- [ ] gcloud CLI authed on the mini
- [ ] `server/` hello-world deploys to Cloud Run dev + prod with one command
- **Accept:** `curl https://<dev-url>/health` → `{"ok":true}` on both envs;
  budget alert email verified.

## MC1 — Cloud rubrics                                 Status: NOT STARTED
Rubrics in Firestore with versioning; public read API; director-editable later
(MC4). iOS fetches on launch, caches, falls back to bundled copy offline.
- CLOUD: [ ] `GET /v1/rubrics` + `GET /v1/rubrics/:id` (versioned payload)
- CLOUD: [ ] seed from `medadvisor/rubrics/*.json`
- iOS:   [ ] fetch on launch → cache → bundled fallback (airplane-mode safe)
- **Accept:** edit a criterion in Firestore → phone shows it without an app
  update; airplane mode still fully works.
- **Interface (fill in when live):** base URL dev: ____  prod: ____

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
