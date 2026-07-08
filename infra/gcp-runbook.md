# GCP setup runbook (MC0)

Console steps Bilal clicks + commands run on the mini. No secrets in this file.

## 1. Projects (console.cloud.google.com)

1. Sign in with the Google account that will own everything (Bilal's).
2. Top bar project picker → **New Project** → name `medadvisor-dev` → Create.
3. Repeat for `medadvisor-prod`.
4. Both projects: attach the billing account when prompted.

## 2. Billing protection (do this BEFORE anything can cost money)

Per project: **Billing → Budgets & alerts → Create budget**
- Amount: $10/month to start.
- Alerts at 50% / 90% / 100%, email to Bilal.
- (Budgets alert, they don't hard-stop — the low Cloud Run max-instances is
  the actual spend ceiling.)

## 3. Enable services (per project)

Console → APIs & Services → Enable, or after gcloud auth:

```sh
gcloud services enable run.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com identitytoolkit.googleapis.com \
  --project medadvisor-dev
```

(Repeat with `--project medadvisor-prod`.)

- Firestore: console → Firestore → Create database → Native mode → region
  `us-west1` (or nearest) → production rules (deny-by-default).
- Identity Platform: console → Identity Platform → enable → add Email/Password
  provider (Sign in with Apple added in MC2).

## 4. gcloud CLI on the mini

```sh
brew install --cask google-cloud-sdk
```

Then Bilal authenticates interactively (type it with the `!` prefix in chat,
or in a plain terminal):

```sh
gcloud auth login
gcloud config set project medadvisor-dev
```

## 5. Deploy the hello-world (MC0 acceptance)

From `server/` — Cloud Run builds the Dockerfile remotely, no local docker
needed:

```sh
gcloud run deploy medadvisor-api \
  --source . \
  --project medadvisor-dev \
  --region us-west1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --set-env-vars APP_ENV=dev
```

It prints a service URL. Verify:

```sh
curl https://<printed-url>/health   # → {"ok":true,...,"env":"dev"}
```

Repeat with `--project medadvisor-prod` / `APP_ENV=prod` for prod.
Record both URLs in PLAN.md under MC1's Interface section.
