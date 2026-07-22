#!/usr/bin/env bash
set -euo pipefail

# One-command Cloud Run deploy for medadvisor-api (MC0 acceptance).
# Usage: infra/deploy.sh dev|prod
#
# Builds server/ remotely via Cloud Build (no local docker needed) and
# verifies /health after deploy. min 0 / max 2 instances = bill protection.

# Pin the dedicated gcloud configuration so this never depends on (or
# disturbs) the mini's globally active config, which other projects use.
export CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor

ENV="${1:-}"
# FIREBASE_API_KEY is the public client identifier (ships in app bundles /
# browser pages) — not a secret. Real secrets go to Secret Manager.
case "$ENV" in
  dev)
    PROJECT="medadvisor-dev"
    FIREBASE_API_KEY="AIzaSyBvHos84simxPRf4z8ICERrVz6zhYkayaE"
    ;;
  prod)
    PROJECT="medadvisor-production"  # 'medadvisor-prod' ID was taken globally
    FIREBASE_API_KEY="AIzaSyCtAMi8JOzeJWsSaP5yV4WU9FPDsI5ye00"
    ;;
  *) echo "usage: $(basename "$0") dev|prod" >&2; exit 1 ;;
esac

REGION="us-west1"
SERVICE="medadvisor-api"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Allowlist of emails permitted to edit the GLOBAL rubrics (comma-separated).
# Pass it in the environment, e.g.  RUBRIC_EDITOR_EMAILS=dir@x.org infra/deploy.sh prod
# Empty = nobody can write rubrics (secure default; public reads unaffected).
RUBRIC_EDITOR_EMAILS="${RUBRIC_EDITOR_EMAILS:-}"

# Guardrail: a prod deploy is irreversible-ish and public — require an explicit
# confirmation and a clean tree so muscle-memory / a dirty checkout can't ship.
if [ "$ENV" = "prod" ]; then
  if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
    echo "!!! working tree is dirty — commit or stash before a prod deploy." >&2
    git -C "$ROOT" status --short >&2
    exit 1
  fi
  if [ -z "${RUBRIC_EDITOR_EMAILS}" ]; then
    echo "!!! RUBRIC_EDITOR_EMAILS is empty for a prod deploy." >&2
    echo "    Rubric editing will be locked for everyone. Set it (or re-run to confirm)." >&2
  fi
  printf 'About to deploy to PROD (%s). Type the project id to confirm: ' "$PROJECT" >&2
  read -r CONFIRM
  [ "$CONFIRM" = "$PROJECT" ] || { echo "aborted." >&2; exit 1; }
fi

echo ">>> building dashboard bundle (Vite -> server/public)"
[ -d "$ROOT/dashboard/node_modules" ] || npm --prefix "$ROOT/dashboard" ci --silent
npm --prefix "$ROOT/dashboard" run build >/dev/null

echo ">>> deploying $SERVICE to $PROJECT ($REGION, APP_ENV=$ENV)"
gcloud run deploy "$SERVICE" \
  --source "$ROOT/server" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --service-account "medadvisor-api@$PROJECT.iam.gserviceaccount.com" \
  --set-env-vars "^@@^APP_ENV=$ENV@@PROJECT_ID=$PROJECT@@FIREBASE_API_KEY=$FIREBASE_API_KEY@@RUBRIC_EDITOR_EMAILS=$RUBRIC_EDITOR_EMAILS" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo ">>> deployed: $URL"
echo ">>> verifying /health:"
curl -fsS "$URL/health"
echo
