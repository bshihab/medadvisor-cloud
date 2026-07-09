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
- 🔒 Least-privilege runtime service account (replaces default compute SA,
  which carries project Editor). Pending commands, per project
  (dev shown; repeat with medadvisor-production):
  ```sh
  export CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor
  gcloud iam service-accounts create medadvisor-api \
    --display-name "MedAdvisor API runtime (least privilege)" --project medadvisor-dev
  for R in roles/datastore.user roles/firebaseauth.admin roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding medadvisor-dev \
      --member serviceAccount:medadvisor-api@medadvisor-dev.iam.gserviceaccount.com \
      --role $R --condition=None; done
  ```
  Then uncomment `--service-account` in `infra/deploy.sh` and redeploy.
- 🔒 Restrict the Firebase API keys to the three services client auth needs
  (currently unrestricted — usable against any enabled API):
  ```sh
  gcloud services api-keys list --project <proj>   # find the key UID
  gcloud services api-keys update <key-uid> --project <proj> \
    --api-target=service=identitytoolkit.googleapis.com \
    --api-target=service=securetoken.googleapis.com \
    --api-target=service=firebaseinstallations.googleapis.com
  ```
  (Later: split browser vs iOS keys and add bundle-ID/referrer restrictions.)

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
- 🔒 Firestore data-access audit logs on prod (who read what, at the DB
  layer; complements app-level audit): edit prod IAM policy auditConfigs to
  add DATA_READ/DATA_WRITE for firestore.googleapis.com. (I'll do the
  read-modify-write with gcloud once approved.)

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
- 👤 **Google BAA** — REQUIRED before any real-patient-derived data on prod:
  Cloud Console → burger menu → "Compliance" (or IAM & Admin → Legal &
  Compliance) → HIPAA BAA → review and accept for the billing account /
  both projects, signed in as shihabbilal@gmail.com.
- 👤 Custom domains (dashboard + Cloudflare R2 model bucket) — needs the
  domain name + Cloudflare account; r2.dev URL is dev-mode only.
- ⏸ Staging environment — proposed: defer until pre-GA (CLAUDE.md stack
  notes say "staging later"; dev serves the rehearsal role while prod has
  no real users). Also: billing account 019BCD has exactly one project
  slot left — a staging project would consume it.
- ⏸ Prod org bootstrap deliberately not run — waits for cohort onboarding.
