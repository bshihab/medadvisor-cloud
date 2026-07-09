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

## MC3 — Sync with the review gate (iOS lane)          Status: DONE 2026-07-09
Tier-2 sharing: scores + redacted evidence quotes, nothing else.
- iOS:   [x] Second-pass rule-based NER redaction (NLTagger + regex) over quotes
      — VERIFIED on device 2026-07-09: planted patient name in a recording
      surfaced as [NAME] at the review gate
- iOS:   [x] "Share with mentor" review screen: trainee sees EXACT payload,
      edits/removes quotes, confirms → upload (org-scoped) — share verified
      against dev end-to-end
- iOS:   [x] Cross-device restore of own history when logged in — VERIFIED
      2026-07-09 (delete local + sign out/in -> shared sessions reappear)
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

## MC4 — Mentor dashboard v1 (cloud lane)              Status: DONE 2026-07-08
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
- **Accept:** ✅ passed 2026-07-08 — Bilal (as director stand-in) reviewed his
  real shared session end-to-end on the web (cohort → drill-in → rubric
  editor). Re-run formally with the actual program director on prod data at
  cohort onboarding.
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

## MC5 — Hardening        Status: DONE 2026-07-08 (staging + domains deferred)
Full control-by-control status: `infra/security-checklist.md`.
- [x] Rate limiting (600/15min global, 20 redeem, 120 sessions, per IP) —
      verified live (429 after limit); audit logging (structured, no payload
      content, 6 action types) — verified in Cloud Logging. Deployed to dev;
      prod deploy pending approval.
- [x] Monitoring/alerting: /health uptime checks every 5 min + email alert
      policies on BOTH projects (to shihabbilal@gmail.com).
- [x] Security-rules review — written up in the checklist (rules deny-all
      both envs; token/authz/no-transcript controls verified).
- [x] Least-priv runtime SA (dev+prod, verified switched + regression pass),
      all 4 API keys restricted to the 3 auth services, Firestore
      data-access audit logs on prod — executed by Bilal via
      `infra/mc5-harden.sh` 2026-07-08; hardened build live on BOTH envs.
- [x] Google BAA — ✅ accepted 2026-07-08 by Bilal (covers the account;
      PHI only in covered services — see checklist).
- [~] Custom domains: DEFERRED 2026-07-08 — Bilal is considering a product
      rename, so no domain gets bought/bound yet. Cheap to defer: all URLs
      in use are Google/Cloudflare infra URLs, invisible to end users except
      the dashboard link. Revisit at cohort onboarding alongside the rename
      decision (bundle ID must be settled BEFORE App Store release).
- [~] Staging environment — DEFERRED to pre-GA per recommendation (dev
      fills the role while prod has no real users; a staging project would
      also consume 019BCD's last billing slot). Bilal can veto.
- **Accept:** ✅ 2026-07-08 — security checklist pass (all controls ✅ or
  explicitly deferred with reasons); billing caps verified: $10 budgets +
  50/90/100 alerts on both projects, max-instances=2 enforced in deploy.sh
  and confirmed on both services. (Budget alert *email* still pending a
  real threshold crossing — noted in MC0.)

## MC4.5 — Dashboard redesign (cloud lane)             Status: NOT STARTED
Real login screen + full visual pass to match the iOS app's feel. Still
vanilla JS, no framework (polish ≠ rewrite; framework decision stands).
- [ ] Login screen: its own page state (not the bare form) — centered card,
      product identity, blue/indigo/purple ambient palette, friendly errors
      ("Wrong password" not `auth/invalid-credential`)
- [ ] Visual pass on all views: rounded cards, generous spacing, ambient
      gradient background, consistent type scale
- [ ] Proper loading / empty / error states for every view (cohort,
      drill-in, rubrics, editor, notes)
- [ ] Wording: "Mentor"/"Trainee" everywhere user-facing (server keeps
      admin/trainee internally — see decisions log)
- **Accept:** Bilal puts dashboard and app side by side and calls them the
  same family; no view renders blank on empty org or slow network.

## MC6 — Mentor notes, session delete, mentor invites  Status: IN PROGRESS
Notes are phase-1 PULL-based — no push/APNs (future milestone; decisions log).
- CLOUD: [x] notes model + endpoints — LIVE ON DEV, verified: CRUD, newest-
      first reads, unknown-key/membership/session-ownership validation,
      author-only edit/delete (403), re-delete 404, trainee POST 403.
      Prod held for Bilal's go-ahead.
- CLOUD: [x] `DELETE /v1/sessions/:clientSessionId` — LIVE ON DEV, verified:
      owner delete 200, re-delete 404, foreign clientSessionId 404 (own-
      namespace resolution), vanishes from reads, attached note cascaded.
- CLOUD: [x] `role: admin` codes verified end-to-end on dev 2026-07-08:
      mint (maxUses 1) → fresh signup → redeem → claims `admin` after token
      refresh → roster read 200. Mentor joining works exactly like trainee.
- DASH:  [ ] notes UI in drill-in: write/edit/delete a note on a session and
      on the trainee generally
- iOS:   [x] mentor-notes display + unread badge (consumes notes reads) —
      BUILT (Progress card + list, local last-seen badge); device test pending
- iOS:   [x] delete-everywhere flow — BUILT (shared dialog: device-only w/
      tombstone vs everywhere, cloud-first); device test pending
- iOS:   [x] native read-only mentor view driven by `/v1/me` role — BUILT
      (Account -> My cohort -> trainee sessions); device test pending
- **Accept:** mentor writes one session note + one general note on the web →
  trainee's phone shows both via pull with an unread badge; trainee deletes a
  shared session → it vanishes from the dashboard and its notes cascade away;
  a fresh account redeeming a mentor code becomes a Mentor who sees the
  roster.
- **Compatibility note for the iOS lane:** `GET /v1/me/sessions` and
  `GET /v1/orgs/:orgId/sessions` item shapes are UNCHANGED by MC6. Notes are
  a separate resource — join client-side via `sessionId`.
- **Interface (SETTLED 2026-07-08 — iOS chat can build against this):**

  **Mentor notes.** A note is attached to a trainee generally
  (`sessionId: null`) or to one shared session (`sessionId` = the id from
  the sessions API). Note item shape (all endpoints return this):
  ```json
  { "noteId": "auto-id", "sessionId": null,
    "traineeUid": "…", "authorUid": "…",
    "authorEmail": "…", "authorDisplayName": null,
    "text": "…", "createdAt": "ISO", "updatedAt": "ISO" }
  ```
  - `GET /v1/me/notes?limit=` (trainee) → `{ "notes": [items], "count" }`,
    newest first (`createdAt` desc). No org claims yet → empty list.
  - `GET /v1/orgs/:orgId/notes?traineeUid=&sessionId=&limit=` (Mentor of
    that org; filters optional) → same envelope, newest first.
  - `POST /v1/orgs/:orgId/notes` (Mentor) body
    `{ "traineeUid", "sessionId"?, "text" }` → 200 item. Validation:
    unknown keys rejected; `traineeUid` must be an org member; if
    `sessionId` given, the session must exist AND belong to `traineeUid`;
    `text` 1–4000 chars. 400 `invalid_body` + detail on violation.
  - `PATCH /v1/orgs/:orgId/notes/:noteId` body `{ "text" }` — author-only
    (other mentors: 403) → 200 item with bumped `updatedAt`.
  - `DELETE /v1/orgs/:orgId/notes/:noteId` — author-only → 200
    `{ "deleted": true }`; unknown/already-deleted → 404.
  - **Unread badge (phase 1, stated explicitly):** the server stores NO
    read receipts. The client persists its own last-seen timestamp and
    badges notes with `updatedAt > lastSeen`. Pull on launch/foreground —
    no push until the APNs milestone.
  - Firestore: `orgs/{orgId}/notes/{noteId}` (server-only access,
    deny-all rules unchanged).

  **Session delete.** `DELETE /v1/sessions/:clientSessionId` (Bearer; org
  claims required, else 403 `forbidden`):
  - Deletes the caller's own session — the stored doc id is
    `{uid}__{clientSessionId}` with `uid` taken from the TOKEN, so a
    non-owner cannot even address someone else's session (the 403-on-
    non-owner case is enforced by construction; a foreign
    clientSessionId resolves inside the caller's own namespace and 404s).
  - Attached mentor notes (same `sessionId`) are deleted in the same
    batch — a retracted session leaves nothing behind, including
    commentary about it.
  - → 200 `{ "deleted": true, "sessionId" }`; unknown or already deleted
    → 404 `not_found` (clients may safely treat 404 as success —
    repeat deletes converge on the same end state).
  - It disappears from `GET /v1/me/sessions` and the mentor dashboard
    immediately; iOS layers local tombstones on top so restore doesn't
    resurrect device-only deletes.

  **Mentor invite codes.** Already supported by the MC2 machinery — no new
  endpoints: `POST /v1/orgs/:orgId/invites` with `{ "role": "admin" }`
  mints a mentor code; redeem grants claims `{ orgId, role: "admin" }`.
  How a mentor joins an org, the two paths:
  1. **Bootstrap** (first mentor / director): `infra/bootstrap-org.mjs`
     creates the account, claims, and membership directly.
  2. **Mentor code**: an existing Mentor mints a `role: admin` code (web,
     later) or ops mints one via the API; the new mentor signs up normally
     and redeems it exactly like a trainee code.
  Wire values stay `admin`/`trainee`; UI renders "Mentor"/"Trainee".

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
- 2026-07-08 **Role names: "Mentor" and "Trainee"** in all user-facing
  surfaces (app + dashboard). The server/API keeps `admin`/`trainee` as wire
  values — renaming stored claims/roles isn't worth the migration.
- 2026-07-08 **Roles are granted by invite, never self-declared at signup.**
  Trainee codes exist since MC2; Mentor status comes from bootstrap or a
  `role: admin` invite code. Signup itself carries no role.
- 2026-07-08 **Mentor notes ship phase-1 pull-based.** No push notifications;
  client polls on launch/foreground and badges via last-seen timestamp.
  APNs is a future milestone.
