# Security checklist (MC5)

Status legend: ✅ in place · 🔒 ready, needs Bilal approval to run · 👤 Bilal
console action · ⏸ deferred by decision. Re-review at cohort onboarding and
before any real-patient use.

## Identity & access

- ✅ Identity Platform (BAA-eligible), project-level accounts; email/password
  + Sign in with Apple. API never handles passwords (sign-in is client↔IdP).
- ✅ Server verifies Firebase ID tokens (audience/issuer) on every authed
  route; org/role authz from custom claims set only by the server at
  invite redeem. Identity is stamped from the token, never from request bodies.
- ✅ Admin-only routes (roster, org sessions, invite create, rubric write)
  check `role=admin` AND org match; verified 403 paths.
- ✅ Least-privilege runtime service account — done 2026-07-08 via
  `infra/mc5-harden.sh` (run by Bilal): `medadvisor-api@<proj>` with ONLY
  datastore.user + firebaseauth.admin + logging.logWriter, on dev AND prod;
  Cloud Run runtime identity switched (verified) and full regression passed
  (sign-in, token verify, Firestore read/write, admin authz).
- ✅ Firebase API keys restricted — done 2026-07-08: all 4 keys (iOS +
  browser, both projects) limited to identitytoolkit + securetoken +
  firebaseinstallations; sign-in verified still working after restriction.
  (Later: add bundle-ID/referrer restrictions per key.)

## Data

- ✅ Firestore rules deny-by-default on dev AND prod; clients never touch
  Firestore (server-mediated, Admin SDK). `infra/firestore.rules`.
- ✅ Org scoping enforced server-side on every read/write (paths are
  `orgs/{orgId}/…`, orgId comes from claims).
- ✅ No-transcript guarantee at the API boundary: session uploads reject
  unknown keys at top level AND inside criteria; evidence/tip/summary are
  length-capped. Only Tier-2 data (scores + redacted quotes) can exist here.
- ✅ Secrets: none in repo (gitignore covers .env/keys); Firebase API keys
  are public client identifiers by design. Real secrets → Secret Manager.
- ✅ Firestore data-access audit logs on prod — done 2026-07-08 via
  `infra/mc5-harden.sh` (DATA_READ + DATA_WRITE under
  `datastore.googleapis.com`, which is where Firestore's audit config lives).

## API hardening

- ✅ Rate limiting (per IP, per instance; max-instances=2 ⇒ effective ×2):
  600/15min global · 20/15min invite redeem (anti code-guessing; codes are
  32^8 anyway) · 120/15min session uploads. 429 `rate_limited`,
  standard RateLimit headers. Verified live.
- ✅ App-level audit log: structured NOTICE lines (action, uid, orgId, ip —
  never payload content) for invite.redeem/create, session.upsert,
  org.members.read, org.sessions.read, rubric.update. Verified in Cloud
  Logging (`jsonPayload.type="audit"`).
- ✅ `x-powered-by` disabled; `trust proxy = 1` (req.ip = Cloud Run-appended
  client IP, unspoofable).
- ✅ Rubric writes require version bump (409 otherwise) — no silent edits.

## Platform

- ✅ Billing: $10/mo budget per project, 50/90/100% email alerts;
  max-instances=2 is the hard spend ceiling. (Budget email itself only
  demonstrable on real spend.)
- ✅ Monitoring: uptime checks on /health every 5 min (dev + prod) with
  email alert policies ("medadvisor-api /health DOWN") to shihabbilal@gmail.com.
- ✅ **Google BAA accepted 2026-07-08** by Bilal (shihabbilal@gmail.com) via
  console.cloud.google.com/iam-admin/privacy in medadvisor-production;
  acceptance covers the account's projects. Reminder: PHI only in covered
  services (Cloud Run, Firestore, Identity Platform all are); re-check the
  covered list before adding any new Google service.
- ⏸ Custom domains (dashboard + Cloudflare R2 model bucket) — deferred
  2026-07-08: Bilal is considering a product rename; revisit with the
  rename decision, before App Store release. r2.dev URL is dev-mode only.
- ⏸ Staging environment — proposed: defer until pre-GA (CLAUDE.md stack
  notes say "staging later"; dev serves the rehearsal role while prod has
  no real users). Also: billing account 019BCD has exactly one project
  slot left — a staging project would consume it.
- ⏸ Prod org bootstrap deliberately not run — waits for cohort onboarding.
