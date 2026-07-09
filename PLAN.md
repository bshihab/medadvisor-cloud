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

## MC1 — Cloud rubrics                                 Status: DONE 2026-07-08
Rubrics in Firestore with versioning; public read API; director-editable later
(MC4). iOS fetches on launch, caches, falls back to bundled copy offline.
- CLOUD: [x] `GET /v1/rubrics` + `GET /v1/rubrics/:id` — live on dev,
      verified (envelope per spec below, 404/500 paths, Cache-Control,
      Firestore round-trip byte-identical to source JSONs)
- CLOUD: [x] seed from `medadvisor/rubrics/*.json` via
      `node infra/seed-rubrics.mjs dev|prod` (idempotent; re-run to re-seed)
- CLOUD: [x] prod: seeded + deployed, endpoints verified (2 rubrics, 404 path)
- iOS:   [x] fetch on launch → cache → bundled fallback (airplane-mode safe)
- **Accept:** ✅ passed 2026-07-08 — edited the outpatient-clinic "opening"
  dimension label in dev Firestore; Bilal's phone showed "Opening (TEST)"
  without an app update (edit then reverted by re-running the seeder).
- **Interface (SETTLED 2026-07-08 — iOS chat can build against this):**
  base URL dev:  `https://medadvisor-api-743594385075.us-west1.run.app`
  base URL prod: `https://medadvisor-api-597896295002.us-west1.run.app`

  `GET /v1/rubrics` → 200
  ```json
  {
    "rubrics": [
      {
        "id": "outpatient-clinic",
        "version": "0.1.0-draft",
        "updatedAt": "2026-07-08T21:04:11.123Z",
        "rubric": { …full rubric document, byte-identical shape to
                    medadvisor/rubrics/*.json (validates against
                    rubric.schema.json — reuse the existing decoder)… }
      }
    ],
    "count": 2,
    "fetchedAt": "2026-07-08T21:05:00.000Z"
  }
  ```
  `GET /v1/rubrics/:id` → 200 `{ "id", "version", "updatedAt", "rubric" }`
  (same item shape as the list) · unknown id → 404 `{ "error": "not_found" }`
  · server fault → 500 `{ "error": "internal" }`

  Semantics:
  - `version` = the rubric's own semver (`rubric.version` surfaced for
    convenience; bumped by humans on criterion changes per the schema).
  - `updatedAt` = Firestore document update time (auto-bumps on ANY console
    edit, even if `version` wasn't touched) — use `(version, updatedAt)` as
    the cache key; refresh cache when either differs.
  - `fetchedAt` = server time of the response; use it (not device clock) to
    stamp the cache.
  - No auth (public read by design); responses send
    `Cache-Control: public, max-age=300`.
  - Firestore: collection `rubrics`, doc ID = rubric `id`, doc content =
    the pristine rubric document (nothing else) — the MC4 editor and the
    console both edit it 1:1.

## MC2 — Accounts & orgs                               Status: DONE 2026-07-08
Identity Platform (email + Sign in with Apple), project-level accounts (see
amended decision — orgs live in Firestore, NOT IdP tenants), invite codes.
- CLOUD: [x] Identity Platform config, org model, invite-code issue/redeem —
      LIVE ON DEV, all paths verified (signup→redeem→claims→roster, 401/403/
      404, idempotent redeem, lowercase normalization). Prod: same build
      deployed + smoke-tested (auth gate, /admin, client-config, rubrics);
      real org NOT bootstrapped — deliberate, waits for cohort onboarding
      (`node infra/bootstrap-org.mjs prod <orgId> "<name>" <directorEmail>`).
- CLOUD: [x] Firestore security rules: deny-by-default deployed to dev AND
      prod (`infra/firestore.rules` via `node infra/deploy-rules.mjs dev|prod`)
- iOS:   [x] optional login UI; "Join my program" invite-code flow
- DASH:  [x] admin login page (minimal) — `<base-url>/admin` (email+password
      → roster table; real dashboard is MC4)
- **Dev test fixtures (for iOS-lane testing):** org `org-directors-program`
  ("Director's Program"); trainee invite code `U3HP8KBK` (50 uses, expires
  2026-08-07); test accounts `director.test@medadvisor.app` (admin) and
  `trainee.test@medadvisor.app` — dev only, throwaway.
  Bootstrap/reseed: `node infra/bootstrap-org.mjs dev <orgId> "<name>" <email>`.
- **Accept:** ✅ passed 2026-07-08 on device — trainee joined via code on the
  phone; director saw the roster at /admin.
- **Interface (SETTLED 2026-07-08 — iOS chat can build against this):**

  **How the app signs in** — FirebaseAuth iOS SDK, straight to Identity
  Platform (our API is not involved in sign-in). Project-level accounts:
  NEVER set `auth.tenantID`. Providers enabled: email/password and
  Sign in with Apple (native `ASAuthorizationController` flow → wrap the
  Apple identity token + raw nonce in an `OAuthProvider` "apple.com"
  credential → `signIn(with:)`).

  Client config (public client identifiers, not secrets — they ship in
  the app bundle):
  - dev:  PROJECT_ID `medadvisor-dev` ·
    API_KEY `AIzaSyBvHos84simxPRf4z8ICERrVz6zhYkayaE` ·
    GOOGLE_APP_ID `1:743594385075:ios:9bb2092806b7e835149ac6`
  - prod: PROJECT_ID `medadvisor-production` ·
    API_KEY `AIzaSyCtAMi8JOzeJWsSaP5yV4WU9FPDsI5ye00` ·
    GOOGLE_APP_ID `1:597896295002:ios:7db9c01f79a5bc79471e63`
  - BUNDLE_ID registered on both: `app.medadvisor.MedAdvisor` (Apple
    provider clientId matches; full GoogleService-Info.plist on request)
  - Apple-portal prerequisite (Bilal, in Xcode on the Air): add the
    "Sign in with Apple" capability to the App ID `app.medadvisor.MedAdvisor`.

  **Login screen (per Apple HIG / App Review):**
  - Use the system `ASAuthorizationAppleIDButton` — never a hand-drawn
    Apple button; at least as prominent as the email option (Review 4.8).
  - Login stays OPTIONAL: the screen must be skippable ("Not now"), never
    gate core app function, and appear in context (enable sync/share), not
    at first launch (HIG: delay sign-in as long as possible).
  - Support light/dark button variants and Dynamic Type.

  **API contract** (authed calls send `Authorization: Bearer <Firebase ID
  token>`; errors are `{"error": "<code>"}` — 401 `unauthenticated`,
  403 `forbidden`, 404 `invalid_code`/`not_found`):
  - `POST /v1/invites/redeem` body `{"code":"ABCD2345"}` →
    200 `{ "orgId", "orgName", "role", "alreadyMember": false }`.
    Codes are 8 chars from A–Z/2–9 minus lookalikes (I,O,0,1); client
    should uppercase input. Invalid/expired/exhausted → 404 `invalid_code`
    (deliberately indistinguishable).
    After a successful redeem the client MUST force-refresh the ID token
    (`getIDTokenForcingRefresh(true)`) to pick up new custom claims.
  - `GET /v1/me` → 200 `{ "uid", "email", "displayName",
    "org": { "orgId", "name", "role" } | null }` — org comes from the
    token's custom claims `{ orgId, role }` (one org per user for now).
  - `GET /v1/orgs/:orgId/members` (admin of that org only) →
    200 `{ "members": [ { "uid", "email", "displayName", "role",
    "joinedAt" } ], "count" }`
  - `POST /v1/orgs/:orgId/invites` (admin only) body
    `{ "role": "trainee", "maxUses": 50, "expiresDays": 30 }` (all
    optional, those are defaults) → 200 `{ "code", "orgId", "role",
    "maxUses", "expiresAt" }`
  - Firestore (server-only; client rules deny-by-default):
    `orgs/{orgId}` `{name, createdAt}` ·
    `orgs/{orgId}/members/{uid}` `{role, email, displayName, joinedAt}` ·
    `inviteCodes/{code}` `{orgId, role, active, maxUses, uses, createdAt,
    expiresAt}`

## MC3 — Sync with the review gate (iOS lane)          Status: IN PROGRESS
Tier-2 sharing: scores + redacted evidence quotes, nothing else.
- iOS:   [x] Second-pass rule-based NER redaction (NLTagger + regex) over quotes
      — VERIFIED on device 2026-07-09: planted patient name in a recording
      surfaced as [NAME] at the review gate
- iOS:   [x] "Share with mentor" review screen: trainee sees EXACT payload,
      edits/removes quotes, confirms → upload (org-scoped) — share verified
      against dev end-to-end
- iOS:   [ ] Cross-device restore of own history when logged in — built
      (GET /v1/me/sessions merge on sign-in), device test pending
- CLOUD: [x] `POST /v1/sessions` + reads (below) — LIVE ON DEV, full contract
      verified (idempotent replace, transcript-key rejection at both levels,
      enum/limit validation, restore read, org read ± uid filter, 401/403).
      Prod deploy pending approval.
- **Accept:** shared session appears on dashboard in seconds; a planted patient
  name is caught by NER or visibly removable at the gate; second device
  restores history; nothing uploads without explicit confirm.
- **Interface (SETTLED 2026-07-08 — confirmed by cloud chat; ▸ marks
  adjustments to the iOS proposal):**
  - `POST /v1/sessions` (Bearer; caller must have org claims, else 403
    `forbidden`) body:
    ```json
    {
      "clientSessionId": "<uuid — idempotency key; re-POST must not duplicate>",
      "recordedAt": "2026-07-09T18:20:00Z",
      "location": "Outpatient Clinic",
      "rubricId": "outpatient-clinic",
      "rubricVersion": "0.1.0-draft",
      "summary": "<redacted, user-reviewed>",
      "criteria": [
        { "id": "intro_self", "dimension": "opening",
          "result": "met|partial|missed|na",
          "evidence": "<redacted quote or null>",
          "tip": "<string or null>" }
      ]
    }
    ```
    → 200 `{ "sessionId" }` ▸ stable, derived from `(uid, clientSessionId)`.
    Server stamps `uid`/`orgId` from claims plus `receivedAt`; REJECTS
    unknown keys ▸ both top-level AND inside criteria items (there is
    deliberately no transcript field anywhere).
    ▸ Re-POST with the same `clientSessionId` REPLACES the stored session
    (last confirmed payload wins) — never duplicates.
    ▸ Validation (violations → 400 `{"error":"invalid_body","detail":…}`):
    `result` ∈ met|partial|missed|na · 1–64 criteria · `summary` ≤ 2000
    chars · `evidence`/`tip` ≤ 500 chars each · `recordedAt` ISO-8601 ·
    `clientSessionId` matches `[A-Za-z0-9_-]{1,128}`.
    ▸ Server records `rubricId`/`rubricVersion` as sent and does NOT
    cross-validate criterion ids against the rubric store (tolerates
    version skew between phone cache and cloud rubric by design).
  - `GET /v1/me/sessions` → caller's own shared sessions, newest first
    (`recordedAt` desc): `{ "sessions": [ <body shape + "sessionId" +
    "receivedAt" + "uid"> ], "count" }`.
    ▸ `?limit=` optional (default 100, max 500). ▸ Caller with no org
    claims gets `{"sessions":[],"count":0}` (nothing can have been shared).
  - `GET /v1/orgs/:orgId/sessions` (admin of that org) → same list shape.
    ▸ `uid` query param is OPTIONAL: omit → all org sessions (feeds the
    MC4 cohort view/trends), set → one trainee (drill-in). `?limit=` as
    above. Join uid → name/email via `GET /v1/orgs/:orgId/members`.
  - ▸ Firestore: `orgs/{orgId}/sessions/{uid}__{clientSessionId}` with
    `{uid, orgId, clientSessionId, recordedAt, receivedAt, location,
    rubricId, rubricVersion, summary, criteria}` (server-only access,
    same deny-all rules).

## MC4 — Mentor dashboard v1 (cloud lane)   Status: BUILT 2026-07-08 (accept pending)
Data feeds ready: roster (MC2) + sessions reads (MC3 cloud, ± uid filter).
- [x] Cohort view: trainees, session counts, last-shared, overall trend
      sparkline per member — live on dev + prod at `/admin`
- [x] Trainee drill-in: per-dimension trend sparklines + per-session cards
      (summary, criteria grouped by dimension with met/partial/missed/na
      badges, evidence quotes, tips; prompts joined from the rubric)
- [x] Rubric editor: name/version/dimension-labels/prompt/what-good-looks-
      like/weight fields + raw-JSON advanced mode; enforces version bump
      (409 on unchanged); all PUT paths verified on dev (409/400/403/200,
      public read reflects edits immediately; test edit reverted via seeder)
- **Accept:** the director completes a real trainee review using only the
  web. (Pending — needs Bilal/director click-through on real data.)
- Session scoring shown on the web: met=1, partial=0.5, missed=0, na
  excluded; dimension score = mean over its criteria, overall = mean of
  dimension scores. (Display-only convention — phones own real scoring.)
- **Interface (SETTLED 2026-07-08):**
  - Dashboard = vanilla-JS static SPA served by the API container at
    `/admin` (no framework — see decisions log). Views: cohort table
    (session counts, last shared, trend sparkline) → trainee drill-in
    (per-dimension trends; sessions with per-criterion results, evidence
    quotes, tips; dimension labels joined from the rubric) → rubric editor.
  - `PUT /v1/rubrics/:id` (Bearer; role=admin — NEW, dashboard-only) body =
    the full rubric document (same shape as MC1's `rubric` field).
    Rules: `body.id` must equal `:id` · `version` must DIFFER from the
    stored version (else 409 `{"error":"version_conflict"}`) · structural
    validation (name, dimensions with id/label, criteria with
    id/dimension/prompt/responseType/weight, every criterion.dimension
    references a dimension id) → 400 `invalid_body` + detail ·
    unknown rubric → 404 `not_found`.
    → 200 `{ "id", "version", "updatedAt" }`. Phones pick edits up via MC1
    semantics (updatedAt/version change); scoring math is per-session
    versioned, so old sessions stay tied to the version they were scored
    against.
  - Rubric store stays GLOBAL (not org-scoped) in v1 — acceptable while
    org #1 is the only design partner; revisit at second institution.

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
- 2026-07-08 **Dashboard framework: none (v1).** Vanilla ES modules + the
  Firebase Auth CDN module, served as static files from the API container at
  `/admin`. Smallest thing that ships; zero build step; bundle stays tiny per
  the stack rules. Revisit (and use `dashboard/`) if scope outgrows it.
- 2026-07-08 **AMENDS "tenants = orgs": project-level accounts.** IdP accounts
  can never move into a tenant after creation, which breaks "login optional,
  join program later via code". So: one project-level auth realm; org
  membership/roles live in Firestore, granted by invite-code redeem (works
  before or after sign-up). IdP tenants reserved for institution SSO (MC5+).
  Still Identity Platform (BAA-eligible) — only the tenant feature is unused.
