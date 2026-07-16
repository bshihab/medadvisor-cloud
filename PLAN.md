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
  NEVER set `auth.tenantID`. Providers enabled: email/password,
  Sign in with Apple (native `ASAuthorizationController` flow → wrap the
  Apple identity token + raw nonce in an `OAuthProvider` "apple.com"
  credential → `signIn(with:)`), and — AMENDED 2026-07-08 — **Google**.

  **Google sign-in (added 2026-07-08; iOS-lane contract):**
  STATUS: SETTLED & VERIFIED on BOTH envs (dev 2026-07-08, prod
  2026-07-09) — providers enabled, web clients auto-set, iOS clients
  provisioned. iOS chat: drop the prod IDs into the release config.
  - iOS flow: GoogleSignIn SDK natively → `GIDSignIn.sharedInstance.signIn`
    → `GoogleAuthProvider.credential(withIDToken:accessToken:)` →
    `auth.signIn(with:)`. Same project-level account pool as the other
    providers — NEVER set `auth.tenantID`. Our API is not involved.
  - **iOS OAuth client IDs (per env):**
    - dev CLIENT_ID:
      `743594385075-k98bthp09fubpvsk54ni65ji8ic5ia1j.apps.googleusercontent.com`
    - dev REVERSED_CLIENT_ID (register as URL scheme):
      `com.googleusercontent.apps.743594385075-k98bthp09fubpvsk54ni65ji8ic5ia1j`
    - prod CLIENT_ID:
      `597896295002-fsm8d0j9tsqjmsh5i2pq4gttio9psen5.apps.googleusercontent.com`
    - prod REVERSED_CLIENT_ID (URL scheme, release config):
      `com.googleusercontent.apps.597896295002-fsm8d0j9tsqjmsh5i2pq4gttio9psen5`
    They land in the refreshed `GoogleService-Info.plist` per env (re-pull
    both — each plist now carries its pair).
  - **Account linking (verified in IdP config, both envs):**
    `signIn.allowDuplicateEmails = false` → **one account per email**.
    Google sign-in with an email that already has a password/Apple account
    resolves to the SAME uid, so org membership and custom claims survive.
    The app may still see `auth/account-exists-with-different-credential`
    for non-Google providers colliding with an email — word the error as
    "You already have an account with this email — sign in with the method
    you used before." Test both orders (password→Google, Google→password).
  - **Server-side web client (invisible to the app):** yes, the IdP
    `google.com` provider config requires a WEB client id/secret — the
    Firebase console toggle provisions and sets it automatically; I verify
    it's populated after enablement. Nothing for the app to do with it.
  - Login screen: per Review 4.8 the Apple button stays at least as
    prominent as Google's.
  - Dashboard Google-login: OUT OF SCOPE for mentors now (email works).
    A "Continue with Google" button already exists on /admin from earlier
    same-day work — it stays as a bonus and simply starts working once the
    provider is enabled; treat as future option, not a deliverable.
  - Why console, not API: enabling `google.com` requires OAuth clients and
    Google exposes no API to create them; the Firebase console toggle
    auto-provisions web + iOS clients for registered apps (verified:
    REST returns "client_id cannot be empty", and neither project has an
    iOS OAuth client yet — plists carry no CLIENT_ID).

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
  - **Apple sign-in on the WEB dashboard** (added 2026-07-09): the
    "Continue with Apple" button is live on the login card (dev), but it
    errors at Apple until Bilal completes the web config: ① Services ID
    (e.g. `app.medadvisor.web`) with Sign in with Apple enabled and return
    URLs `https://medadvisor-dev.firebaseapp.com/__/auth/handler` +
    `https://medadvisor-production.firebaseapp.com/__/auth/handler`;
    ② a Sign in with Apple key (.p8, note Key ID + Team ID);
    ③ Firebase console → Authentication → Apple (both projects): fill
    Services ID / Team ID / Key ID and paste the .p8 there (never in chat
    or the repo). Native iOS Apple sign-in is unaffected throughout.
    One account per email means app-Apple accounts land in the same
    account on the web.

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

## MC4.5 — Dashboard redesign (cloud lane)   Status: BUILT 2026-07-08 (accept pending)
Real login screen + full visual pass to match the iOS app's feel. Still
vanilla JS, no framework (polish ≠ rewrite; framework decision stands).
- [x] Login screen: centered brand card, blue/indigo/purple ambient
      gradient, friendly error mapping, busy state on the button
- [x] Visual pass on all views: rounded cards, soft shadows, gradient
      accents, pill tabs, light+dark themes
- [x] Loading / empty / error states: boot spinner, per-view loading,
      empty-cohort/empty-sessions/no-notes states, load-failure view with
      retry; verified in a headless browser (incl. a caught-and-fixed bug:
      author CSS was overriding the `hidden` attribute, leaving the login
      card visible after sign-in)
- [x] Wording: "Mentor"/"Trainee" in all user-facing text
- **Accept:** Bilal puts dashboard and app side by side and calls them the
  same family; no view renders blank on empty org or slow network.
  (Pending Bilal's eyeball; live on dev + prod as of 2026-07-09.)
- [x] **Unified skill-area visualization** (SETTLED 2026-07-09): dashboard
      drill-in mirrors the iOS spec exactly (see spec section at bottom):
      one row per skill area — label · capsule bar (10px, faint neutral
      track, band-colored fill) · monospace percent in the fill color ·
      smooth 56×20 trend line colored by latest band, omitted-but-spaced
      under 2 sessions. Bands: <40% #FF3B30 / 40–74% #FF9500 / ≥75%
      #34C759. Browser-verified on dev.

## MC6 — Mentor notes, session delete, mentor invites  Status: IN PROGRESS
Notes are phase-1 PULL-based — no push/APNs (future milestone; decisions log).
- CLOUD: [x] notes model + endpoints — LIVE ON DEV, verified: CRUD, newest-
      first reads, unknown-key/membership/session-ownership validation,
      author-only edit/delete (403), re-delete 404, trainee POST 403.
      Prod: deployed + smoke-tested 2026-07-09.
- CLOUD: [x] `DELETE /v1/sessions/:clientSessionId` — LIVE ON DEV, verified:
      owner delete 200, re-delete 404, foreign clientSessionId 404 (own-
      namespace resolution), vanishes from reads, attached note cascaded.
- CLOUD: [x] `role: admin` codes verified end-to-end on dev 2026-07-08:
      mint (maxUses 1) → fresh signup → redeem → claims `admin` after token
      refresh → roster read 200. Mentor joining works exactly like trainee.
- DASH:  [x] notes UI in drill-in (general + per-session composers, author-
      only edit/delete with two-step confirm) — verified live in a headless
      browser: add + delete round-tripped through the API. Live on dev + prod.
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
- CLOUD: [x] retraction markers — LIVE ON DEV, verified: marker is exactly
      the 4 contentless fields (planted "secret" summary/quote provably
      unrecoverable), same-batch atomicity both directions (delete→marker,
      re-share→marker cleared), trainee reads 403. Prod: deployed + smoke-tested 2026-07-09.
- CLOUD: [x] `GET /v1/orgs/:orgId/invites` — live on dev (active+unexpired
      only, newest first, audited)
- DASH:  [x] retraction lines in the drill-in timeline (muted italic line,
      no card, excluded from counts/trends) — browser-verified on dev
- DASH:  [x] make-key UI: mint button with Trainee/Mentor picker (Mentor
      minted single-use + labeled "full program access"), fresh-code
      callout with Copy, active-codes table — browser-verified end-to-end
      (minted QHNCS8YG through the UI)
- **Compatibility note for the iOS lane:** `GET /v1/me/sessions` and
  `GET /v1/orgs/:orgId/sessions` item shapes are UNCHANGED by MC6 (including
  by retraction markers — those are a separate admin-only read). Notes are
  a separate resource — join client-side via `sessionId`.
- **Interface: self-serve program creation (SETTLED 2026-07-09; decision
  in the log — replaces ops bootstrap for onboarding):**
  - `POST /v1/orgs` (Bearer; any signed-in account that has NO org yet)
    body `{ "name": "<1–80 chars>" }` → 200
    `{ "orgId", "name", "role": "admin" }`. The caller becomes the new
    program's Mentor (membership doc + custom claims `{orgId, role:"admin"}`
    set server-side). Client MUST force-refresh the ID token afterwards.
    Caller already in an org → 409 `{ "error": "already_in_org" }`.
    Bad name → 400 `invalid_body`. Rate-limited (5 creations / 15 min / IP).
    `orgId` is server-generated (slug + random suffix) — never client-chosen.
  - WEB: [x] LIVE ON DEV, verified end-to-end in a browser (fresh account
    → gate → created "Cardiology Fellowship" → landed in its own mentor
    console; 409 on second create). An org-less account gets a choice
    screen instead of a dead end: "Create a program" (name → this endpoint)
    or "I have an invite code" (existing `POST /v1/invites/redeem`; a
    Mentor code joins an existing program as co-mentor). The web login
    card also gained a "Create an account" toggle (email/password sign-up
    — Google/Apple already auto-create on first sign-in), completing the
    self-serve path for email-only mentors. Accounts whose
    role is trainee still get a "this dashboard is for mentors" message.
  - iOS: [ ] the app mirrors the same gate for org-less signed-in users:
    "Create a program" (this endpoint) alongside the existing "Join my
    program" code entry. Consumes this contract; no other changes.
  - Mentor codes are UNCHANGED and still the only way to join an EXISTING
    program as mentor. Bootstrap script remains as an ops fallback only.
  - SHAPE CHANGE (additive, 2026-07-10): `GET /v1/orgs/:orgId/members` now
    also returns top-level `"createdBy": uid|null` (the program creator;
    null for pre-self-serve orgs). Existing decoders unaffected.
  - iOS: [ ] the app's mentor view mirrors the web's member grouping
    (Bilal's call): Mentors section first (program creator = "Owner" chip,
    signed-in user = "You" chip), Trainees section below.
- **Interface: retraction markers (SETTLED 2026-07-08):**
  - On successful `DELETE /v1/sessions/:clientSessionId` the server writes,
    in the same atomic batch as the deletion, a CONTENTLESS marker:
    `{ traineeUid, recordedAt, receivedAt, retractedAt }` — the session's
    own recordedAt/receivedAt plus the retraction time. No scores, quotes,
    summary, location, or note content — nothing rereadable survives.
  - Re-POSTing the same `clientSessionId` (trainee re-shares) DELETES the
    marker in the same batch as the upsert — latest intent wins; the
    timeline never shows both a session and its retraction.
  - `GET /v1/orgs/:orgId/retractions?uid=&limit=` (Mentor of that org) →
    `{ "retractions": [ { "traineeUid", "recordedAt", "receivedAt",
    "retractedAt" } ], "count" }`, newest retraction first. That is the
    ENTIRE item — deliberately nothing else.
  - Trainee-facing surfaces: nothing. No trainee endpoint exposes markers.
  - Dashboard renders a muted timeline line — "A session from ‹recordedAt›
    was retracted by the trainee on ‹retractedAt›" — no card, no drill-in,
    excluded from session counts and trend math.
  - Firestore: `orgs/{orgId}/retractions/{sessionId}` (doc id reused for
    idempotency/un-retract; never exposed in responses).
- **Interface: invite-code listing for the make-key UI (SETTLED 2026-07-08):**
  - `GET /v1/orgs/:orgId/invites` (Mentor of that org) →
    `{ "invites": [ { "code", "role", "uses", "maxUses", "createdAt",
    "expiresAt" } ], "count" }` — active, unexpired codes only, newest
    first. Minting stays `POST /v1/orgs/:orgId/invites` (MC2, unchanged).
  - Dashboard: "Invite codes" card — active list + "New invite code" with
    a role picker where the Mentor option is explicitly labeled as granting
    full program access. Wire roles stay `trainee`/`admin`.
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

## MC7 — Push notifications (mentor note → trainee)    Status: IN PROGRESS
Real APNs push when a mentor writes a note; pull-based badge stays as the
fallback (MC6 semantics unchanged).
- BILAL: [ ] APNs auth key: Apple Developer portal → Certificates, IDs &
      Profiles → Keys → new key with "Apple Push Notifications service"
      → download the .p8 ONCE (store it safely, never in the repo), note
      the Key ID + Team ID. Then in Firebase console per project
      (Project settings → Cloud Messaging → Apple app configuration)
      upload the .p8 + Key ID + Team ID for BOTH medadvisor-dev and
      medadvisor-production. (The .p8 lives in Firebase/Google — our
      server never touches it.)
- BILAL: [x] runtime SA granted `roles/firebasecloudmessaging.admin` on
      dev AND prod (run by Bilal 2026-07-09; policy outputs verified).
- CLOUD: [x] token registry endpoints — LIVE ON DEV, contract verified
      (register/upsert/delete 200, malformed 400, unauthenticated 401)
- CLOUD: [x] send push on note create — LIVE ON DEV; proven non-fatal:
      note create returns 200 with a registered token while delivery is
      impossible (logged `messaging/mismatched-credential`); flips to real
      delivery once the APNs key + IAM grant land. Unregistered-token
      cleanup wired. Prod: deployed 2026-07-09 (auth gate smoke-tested).
- iOS:   [ ] permission prompt in context; register FCM token against
      POST /v1/me/push-token; clear on sign-out; tap → deep-link to note
- **Accept:** mentor writes a note on the web → trainee's phone shows a
  banner within seconds; tapping opens that note; after sign-out no more
  pushes arrive; with notifications denied, the MC6 pull badge still works.
- **Interface (SETTLED 2026-07-09 — iOS chat can build against this):**
  - **What the app registers: the FCM registration token** (from the
    Firebase Messaging iOS SDK — it wraps the raw APNs token), NOT the raw
    APNs device token. One registration per device; multiple devices per
    account are fine.
  - `POST /v1/me/push-token` (Bearer; works with or without org claims)
    body `{ "token": "<fcm-registration-token>", "platform": "ios" }` →
    200 `{ "ok": true }`. Re-POST of the same token is an upsert
    (refreshes lastSeen). `token` must match `[A-Za-z0-9:_-]{10,512}`;
    violations → 400 `invalid_body`.
  - `DELETE /v1/me/push-token` body `{ "token": "…" }` → 200
    `{ "ok": true }`, idempotent (call on sign-out; token travels in the
    body, not the URL, so it never lands in access logs).
  - **Notification the phone receives** (per registered device of the
    note's trainee, sent on mentor note create):
    - title: `New note from your mentor`
    - body: first ~120 chars of the note text
    - data (all strings, for deep-linking):
      `{ "noteId": "…", "sessionId": "" | "<sessionId>", "orgId": "…" }`
  - Delivery is best-effort: send failures never affect the note API
    response; tokens rejected as unregistered/invalid are deleted from the
    registry automatically. Until the APNs key + IAM grant land, note
    creation simply logs a non-fatal push failure.
  - Firestore: `users/{uid}/pushTokens/{token}` `{ platform, lastSeenAt }`
    (server-only access; deny-all rules unchanged).

## MC8 — Per-criterion feedback, threads, person-first dashboard  Status: IN PROGRESS
Joint milestone. Notes gain per-criterion anchoring + threaded replies;
dashboard rebuilt person-first on React (decision logged — amends
"no framework"). A-fixes ship on the current dashboard immediately; the
rebuild carries the MC8 UIs so nothing is built twice.
- DASH:  [x] A-fixes SHIPPED to dev + prod (browser-verified): date+time on session
      cards; "X of Y met" headline; skill rows → clickable detail chart
      with per-session points that jump to the session; invite section in
      plain words ("Trainee code · 50 uses (47 left) · expires …" /
      "Mentor code · single use"), single-use rationale caption, mint
      action separated from the list.
- CLOUD: [x] per-criterion notes — LIVE ON DEV + PROD, verified: criterionId
      requires sessionId (400), must exist in that session's criteria
      (400), valid path stores + surfaces it in all reads.
- CLOUD: [x] threaded replies + reply push — LIVE ON DEV + PROD, verified: full
      authz matrix (trainee-on-own ✓, both mentors ✓, nested reply 400,
      non-author edit 403), threads ride chronologically in me/org reads
      with authorRole, root delete cascades the thread, reply push wired
      through the MC7 sender both directions.
- DASH:  [x] React rebuild + ambient-glass redesign LIVE ON DEV + PROD (2026-07-10):
      `dashboard/` = Vite + React + TS + Tailwind + shadcn-style components
      + Recharts (lazy-loaded — entry path ~62 kB gz, Recharts chunk only
      on the skill-detail route). Person-first IA: People page (avatar
      cards + invites) → person → Summary (unified skill rows → Recharts
      detail with tap-to-session points) | Sessions & Conversations
      (general-note threads, session cards with per-criterion 💬 threads,
      retraction lines). Browser-QA'd end-to-end incl. criterion-comment
      and reply round-trips through the UI; zero console errors.
      Build pipeline: deploy.sh runs the Vite build → server/public
      (gitignored, prebuilt-bundle decision); vanilla SPA retired.
- iOS:   [ ] criterion comments inline in the rubric view; reply UI —
      consumes the contracts below.
- **Accept:** mentor comments on one criterion on the web → trainee sees it
  anchored to that criterion in-app, replies → mentor gets the reply and
  answers → the thread reads chronologically on both surfaces; Bilal
  navigates the rebuilt dashboard person-first and calls it the same mental
  model as the app.
- **Interface (SETTLED 2026-07-09 — iOS chat builds against this; both
  changes to the note item are ADDITIVE):**

  **Per-criterion notes.** `POST /v1/orgs/:orgId/notes` gains optional
  `"criterionId"`: only valid together with `sessionId`, and it must match
  a `criteria[].id` present in THAT session (else 400 `invalid_body` +
  detail). Note items in every read now carry `"criterionId": string|null`.
  General notes (no sessionId) and session-level notes (sessionId, no
  criterionId) behave exactly as before.

  **Delete account (SETTLED 2026-07-10).** Self-service erasure; the same
  endpoint serves web mentors and app trainees.
  - `DELETE /v1/me` (Bearer) — deletes ONLY the caller's own account. In one
    batch: their org membership, the notes + replies THEY authored (root
    deletion cascades that root's replies), their own sessions and the
    sessions' retraction markers, their push tokens; then the Identity
    Platform user itself (Admin SDK). → 200 `{ "deleted": true }`; client
    signs out.
  - Owner guard: if the caller CREATED the org and other members remain →
    409 `{ "error": "owner_has_members" }` (must remove/reassign others
    first — can't orphan a program with trainees' data). A sole owner
    deleting takes the now-empty program (org doc + its invite codes) with
    them.
  - No-org accounts (signed up, never joined) → just tokens + the auth user.
  - CLOUD+DASH: [x] LIVE ON DEV, verified end-to-end — solo-owner full
    deletion (auth user gone, re-signin 400) and owner-with-members 409;
    web Account page (/account, via footer identity) with typed-email
    confirmation gating. Prod held for the go-ahead batch.
  - iOS: [ ] "Delete account" in the app's account/settings — same endpoint,
    same behavior (trainee is never an owner, so the guard never trips).
    Consumes this contract; no other changes.

  **Trainee-initiated threads (SETTLED 2026-07-10 — "improved chat" brief).**
  Trainees can now START threads about themselves, not just reply:
  - `POST /v1/me/notes` (Bearer; trainee role with org claims — mentors get
    403 and keep using the org endpoint) body
    `{ "sessionId"?, "criterionId"?, "text" }` — same validation as mentor
    notes except `traineeUid` is implicitly the caller and anchors resolve
    in THEIR namespace: `sessionId` must be one of the caller's own
    sessions (else 400), `criterionId` requires it and must exist in that
    session's criteria. → 200 the standard note item
    (`authorRole: "trainee"`, `replies: []`). Reads are UNCHANGED — trainee
    roots ride the same `GET /v1/me/notes` / org-notes threads.
  - Push: a trainee root notifies ALL the org's mentors ("New message from
    your trainee", preview, data `{noteId, sessionId, orgId}`) — MC7
    sender, best-effort as always. (MC10 assignments will narrow the
    audience later.)
  - iOS: this unlocks the trainee composer and the "Ask about this"
    session/criterion-anchored buttons.
  - DASH: [x] LIVE ON DEV, browser-verified (bubbles both sides with real
    trainee-authored threads, day separators, anchor-chip jump, send,
    hover edit/delete on own bubbles). Person tabs are now
    Summary | Chat | Sessions; the old list-style notes panels were
    retired — Chat is the conversation surface, and the drill-in's
    per-criterion 💬 / per-session Discuss prefill the composer's anchor.
  - CLOUD: [x] POST /v1/me/notes LIVE ON DEV, verified (trainee general +
    criterion-anchored roots, foreign-session 400, mentor 403,
    mentor-notify push wired). Prod held for the go-ahead batch.

  **Threaded replies.** Single-level threads: replies attach to a ROOT
  note only (replying to a reply is a 400 — thread stays flat and
  chronological). Note items in every read gain
  `"replies": [ <reply items, createdAt ascending> ]`.
  Reply item: `{ "replyId", "parentNoteId", "authorUid", "authorEmail",
  "authorDisplayName", "authorRole": "admin"|"trainee", "text",
  "createdAt", "updatedAt" }` (UI renders authorRole as Mentor/Trainee).
  - `POST /v1/orgs/:orgId/notes/:noteId/replies` body `{ "text" }`
    (1–4000 chars, unknown keys rejected) → 200 reply item.
    WHO MAY: a Mentor of that org, or the trainee the root note is
    addressed to (`root.traineeUid == caller`) — no one else (403).
  - `PATCH /v1/orgs/:orgId/notes/:noteId/replies/:replyId` `{ "text" }` —
    author-only (others 403), unknown 404.
  - `DELETE …/replies/:replyId` — author-only, idempotency like notes
    (repeat → 404). Deleting a ROOT note cascades its replies; the
    session-delete cascade takes whole threads with it.
  - No new read endpoints: replies ride inside note items on
    `GET /v1/me/notes` and `GET /v1/orgs/:orgId/notes` (limits apply to
    root notes; their replies always ride along).
  - Push (MC7 sender + registry reused, same best-effort guarantees):
    mentor replies → push to the trainee ("Your mentor replied", preview,
    data `{noteId, replyId, orgId}`); trainee replies → push to the root
    note's author ("New reply from your trainee", same data shape).
  - Firestore: same `orgs/{orgId}/notes/*` collection; replies carry
    `parentNoteId` and INHERIT `traineeUid`/`sessionId`/`criterionId` from
    the root, so every existing filtered read returns whole threads.

## MC9 — Private cloud backup (cross-device history)   Status: IN PROGRESS
Each trainee's OWN results auto-back-up to a private per-user space only they
can read — cross-device history that survives a lost phone, with the privacy
promise intact. Full spec + rationale: `docs/private-backup-design.md`
(D1–D5 approved by Bilal 2026-07-15). NOTE: the specialist-hierarchy work
previously sketched as "MC9" is renumbered **MC10** (below).
- CLOUD: [x] `PUT/GET/DELETE /v1/me/backup/sessions` — LIVE ON DEV, fully
      verified: idempotent upsert/replace, restore read + `since` filter,
      404-converging delete, URL/body id mismatch 400, 401 unauthenticated,
      works with NO org claims. **Hard line proven:** `transcript` rejected
      at top level AND `speakerTurns` inside criteria.
      **Privacy proven:** every mentor org read (sessions ±uid, notes,
      retractions — real multi-KB responses) contains zero backup data.
      **D5 proven both ways:** deleting the backup leaves the shared copy
      intact and deleting the shared copy leaves the backup intact.
      Prod held for the go-ahead batch.
- CLOUD: [x] `DELETE /v1/me` also erases the private backup — verified
      (audit `backupsDeleted: 1`; account gone, no private copies left)
- iOS:   [x] analysis-time background upload + `backedUpAt` + offline retry
      queue; restore-on-sign-in merge; Settings opt-out; logout/wipe prompts
      — BUILT (PrivateBackup.swift), matches this contract; device test pending
- **Accept:** record a session on device A → it appears on device B after
  sign-in (scores + redacted quotes only, NO transcript); the org/mentor
  dashboard never shows it unless separately shared; deleting it from the
  owner's side leaves a previously-shared mentor copy intact (and vice
  versa); opting out stops new backups.
- **THE HARD LINE (D1):** audio and verbatim transcript/speaker turns are
  NEVER backed up — device-only, always. The API enforces this the same way
  shared sessions do: unknown keys rejected at every level, so there is no
  field a transcript could ride in.
- **Interface (SETTLED 2026-07-15 — iOS chat builds against this; entirely
  additive, no existing shape changes):**
  - Firestore: `users/{uid}/backupSessions/{clientSessionId}` — server-only
    access, deny-by-default rules unchanged. NO org endpoint reads this
    collection: a user's backup is theirs alone, invisible to every mentor.
  - Auth: Bearer, and **org claims are NOT required** — private backup works
    for accounts that belong to no program (it is personal space, not org
    data).
  - `PUT /v1/me/backup/sessions/:clientSessionId` — idempotent upsert (re-PUT
    replaces; last write wins). Body:
    ```json
    { "recordedAt": "2026-07-15T18:20:00Z", "location": "Outpatient Clinic",
      "rubricId": "outpatient-clinic", "rubricVersion": "0.1.0-draft",
      "summary": "<redacted, automated pass>",
      "criteria": [ { "id", "dimension", "result": "met|partial|missed|na",
                      "evidence": "<redacted quote or null>", "tip": null } ] }
    ```
    `clientSessionId` may also appear in the body but MUST equal the URL
    (mismatch → 400) — the URL is authoritative. Validation mirrors
    `POST /v1/sessions` minus org/anchor: unknown keys rejected at top level
    AND inside criteria · `result` enum · 1–64 criteria · summary ≤2000 ·
    evidence/tip ≤500 each · location ≤200 · `recordedAt` ISO-8601 ·
    `clientSessionId` matches `[A-Za-z0-9_-]{1,128}`. Violations → 400
    `{"error":"invalid_body","detail":…}`. → 200
    `{ "clientSessionId", "backedUpAt" }`.
  - `GET /v1/me/backup/sessions?since=&limit=` → `{ "sessions": [ <body shape
    + "clientSessionId" + "backedUpAt"> ], "count" }`, newest first by
    `recordedAt`. `since` = ISO-8601, filters `backedUpAt > since`
    (exclusive) for incremental sync. `limit` default 500, max 500.
  - `DELETE /v1/me/backup/sessions/:clientSessionId` → 200
    `{ "deleted": true, "clientSessionId" }`; unknown/already-deleted → 404
    `not_found` (clients may safely treat 404 as success — repeat deletes
    converge, same convention as `DELETE /v1/sessions`).
  - **Independence (D5):** the private backup and the mentor's shared copy
    are SEPARATE copies. `DELETE /v1/me/backup/sessions/:id` never touches
    `orgs/{org}/sessions`; the existing `DELETE /v1/sessions/:id` (mentor
    copy + retraction marker + attached notes) is unchanged and never
    touches the backup. A session may be backup-only, shared-only, or both.
  - Rate limit: 120 / 15 min / IP on the backup routes (as with sessions).

## MC10 — Specialist hierarchy (Owner assigns; mentors see their own)  Status: NOT STARTED
Bilal's model: main doctor (Owner) at the top; speech specialists each see
only the trainees they train. Renumbered from the earlier "MC9" sketch.
- [ ] Owner assigns trainees to mentors; assigned mentors' org reads are
      server-filtered to their assignees; Owner sees everything and is the
      only one who can mint Mentor codes
- [ ] A trainee redeeming a mentor-minted trainee code is auto-assigned to
      that mentor; Owner can reassign
- [ ] Mentors' own sessions never enter the shared org pool (server rejects;
      app hides the share gate for mentor accounts) — closes the "why can
      other directors see my practice session?" oddity
- **Accept:** specialist A cannot see specialist B's trainees anywhere (web
  or app); Owner sees all; existing pre-hierarchy orgs keep working.

---

## Unified skill-area visualization spec (SETTLED 2026-07-09 — mirrored in
## the dashboard drill-in; live on dev, browser-verified)

One visual language for "progress by skill area" on ALL surfaces (trainee
Insights, native mentor Cohort tab — both shipped — and the web dashboard):

- One ROW per skill area: `label · bar · percent · trend line`.
- **Bar**: horizontal, fully-rounded ends (capsule), thin (~10px), track in a
  faint neutral; fill width = CURRENT (latest session's) score 0–100%.
- **Percent**: right of the bar, semibold, monospaced digits, same color as
  the bar fill.
- **Trend line**: small sparkline (~56×20px, 2px stroke, smooth/catmull-rom)
  of the score across sessions chronologically; colored by the LATEST value's
  band. Omit (keep the space) when fewer than 2 sessions.
- **Band colors** (iOS system palette – use these hex values on the web):
  score < 40% red `#FF3B30` · 40–74% orange `#FF9500` · ≥ 75% green
  `#34C759`. Bands also name levels: Emerging / Developing / Proficient.
- **Score convention everywhere**: met=1, partial=0.5, missed=0, N/A
  excluded; dimension score = mean over its criteria in that session.
  (This REPLACES the old trainee-side "done-rate" met/total math for these
  charts, and matches the dashboard's existing convention.)

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
- 2026-07-08 **Sign in with Google added** as a third provider (Bilal's call;
  trainees often live in institutional Google accounts). Apple button keeps
  ≥ equal prominence per App Review 4.8. Same-email sign-ins link to one
  account, so no membership migration is needed.
- 2026-07-09 **Self-serve program creation (Bilal's call).** Anyone can sign
  in and CREATE their own empty program, becoming its Mentor — safe because
  a new program sees nothing until trainees explicitly join it and share
  into it (the review gate stays the privacy wall). Joining an EXISTING
  program as mentor still requires a single-use Mentor code minted by a
  current mentor — that wall is what keeps org data private. First-mentor
  bootstrap via ops script is retired as the normal path.
- 2026-07-09 **Dashboard theme: "Ambient glass" v2** (design handoff from
  Bilal, owner-approved from a 3-way exploration; implemented same day).
  Replaces the indigo/purple-gradient look: frosted-glass cards over
  teal→blue ambient glows, glass sidebar console (People/Rubrics/Invite
  codes + footer with theme toggle), ONE blue accent (no gradients),
  explicit system/light/dark toggle (`ma-theme`, pre-paint script),
  redesigned rubric editor (collapsible skill areas, weight steppers,
  auto version bump on save, raw JSON demoted), purposeful gated motion.
  Band colors unchanged in both themes.
- 2026-07-09 **MC8: person-first dashboard on React (AMENDS "dashboard
  framework: none").** The vanilla SPA served MC4 well but the surface
  outgrew it (threads, per-criterion feedback, detail charts). Rebuild on
  React + Vite + Tailwind + shadcn/ui + Recharts, IA reorganized around the
  app's mental model: pick a person → their summary or their sessions/
  conversations. Architecture unchanged: Vite emits a static, code-split
  bundle served by the same Express container on Cloud Run (honors the
  "deploy prebuilt bundles" + "small browser bundle" decisions). Same API,
  same auth, no infra change. A-fixes ship on the vanilla SPA first; the
  rebuild carries the MC8 UIs.
- 2026-07-08 **Retraction markers (settled with the iOS chat).** "Delete
  everywhere" remains TRUE deletion — a mentor-visible "deleted" archive or
  mentor-restore was explicitly REJECTED as a trust break. Instead the
  server writes a contentless marker (traineeUid + the session's recordedAt/
  receivedAt + retractedAt — nothing rereadable) so the mentor timeline can
  say a session was retracted without preserving any of its content.
  Re-sharing the same clientSessionId clears the marker (latest trainee
  intent wins).
