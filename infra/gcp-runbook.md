# GCP setup runbook (MC0)

Console steps Bilal clicks + commands run on the mini. No secrets in this file.

## 1. Projects (console.cloud.google.com)

1. Sign in with the Google account that will own everything (Bilal's).
2. Top bar project picker → **New Project** → name `medadvisor-dev` → Create.
3. Repeat for `medadvisor-production` (`medadvisor-prod` is taken globally).
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

(Repeat with `--project medadvisor-production`.)

- Firestore: console → Firestore → Create database → Native mode → region
  `us-west1` (or nearest) → production rules (deny-by-default).
- Identity Platform: console → Identity Platform → enable → add Email/Password
  provider (Sign in with Apple added in MC2).

## 4. gcloud CLI on the mini

```sh
brew install --cask google-cloud-sdk
```

The mini's gcloud serves several projects (bithunch, offloadai), so MedAdvisor
gets its own named configuration instead of the default one:

```sh
gcloud config configurations create medadvisor --no-activate
```

All MedAdvisor gcloud commands select it via the env var — never activate it
globally, so other projects' active accounts are untouched:

```sh
export CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor
```

Then Bilal authenticates interactively inside that configuration (type it
with the `!` prefix in chat, or in a plain terminal):

```sh
CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor gcloud auth login --no-launch-browser
CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor gcloud config set project medadvisor-dev
```

(`infra/deploy.sh` exports the env var itself, so deploys are always pinned.)

## 5. Deploy the hello-world (MC0 acceptance)

One command per environment (Cloud Run builds the Dockerfile remotely via
Cloud Build — no local docker needed):

```sh
infra/deploy.sh dev    # deploy + verify /health on medadvisor-dev
infra/deploy.sh prod   # same for medadvisor-prod
```

The script prints the service URL and curls `/health`
(expect `{"ok":true,...,"env":"dev"}`).
Record both URLs in PLAN.md under MC1's Interface section.

Note: the mini's gcloud has multiple credentialed accounts (bithunch,
offloadai). MedAdvisor lives on Bilal's personal account inside the
`medadvisor` configuration (section 4); `deploy.sh` pins itself to it, and
any manual gcloud command should set `CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor`.
