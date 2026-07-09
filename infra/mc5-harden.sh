#!/usr/bin/env bash
set -euo pipefail

# MC5 hardening batch (see infra/security-checklist.md). Idempotent.
# What this does, per project (medadvisor-dev + medadvisor-production):
#   1. Creates service account medadvisor-api@<project> and grants it ONLY:
#      roles/datastore.user, roles/firebaseauth.admin, roles/logging.logWriter
#      (Cloud Run switches to it on the next deploy — flag is in deploy.sh)
#   2. Restricts every API key in the project (all are Firebase-created client
#      keys) to: identitytoolkit, securetoken, firebaseinstallations
# And on medadvisor-production only:
#   3. Enables Firestore data-access audit logs (DATA_READ + DATA_WRITE)

export CLOUDSDK_ACTIVE_CONFIG_NAME=medadvisor

for P in medadvisor-dev medadvisor-production; do
  echo "== $P: service account =="
  gcloud iam service-accounts create medadvisor-api \
    --display-name "MedAdvisor API runtime (least privilege)" --project "$P" 2>&1 \
    | grep -v "already exists" || true
  for R in roles/datastore.user roles/firebaseauth.admin roles/logging.logWriter; do
    # New SAs take a few seconds to propagate through IAM — retry briefly.
    for ATTEMPT in 1 2 3 4 5 6; do
      if gcloud projects add-iam-policy-binding "$P" \
        --member "serviceAccount:medadvisor-api@$P.iam.gserviceaccount.com" \
        --role "$R" --condition=None --format=none --quiet 2>/tmp/mc5-bind-err; then
        echo "   granted $R"; break
      fi
      if [ "$ATTEMPT" -eq 6 ]; then cat /tmp/mc5-bind-err; exit 1; fi
      echo "   waiting for SA to propagate (attempt $ATTEMPT)..."; sleep 5
    done
  done

  echo "== $P: restrict API keys to auth services =="
  for KEY in $(gcloud services api-keys list --project "$P" --format 'value(uid)'); do
    gcloud services api-keys update "$KEY" --project "$P" \
      --api-target=service=identitytoolkit.googleapis.com \
      --api-target=service=securetoken.googleapis.com \
      --api-target=service=firebaseinstallations.googleapis.com \
      --format=none --quiet
    echo "   restricted key $KEY"
  done
done

echo "== medadvisor-production: Firestore data-access audit logs =="
gcloud projects get-iam-policy medadvisor-production --format json > /tmp/mc5-iam.json
python3 - <<'EOF'
import json
p = json.load(open("/tmp/mc5-iam.json"))
cfgs = p.setdefault("auditConfigs", [])
# Firestore's audit config lives under the legacy Datastore service name.
if not any(c.get("service") == "datastore.googleapis.com" for c in cfgs):
    cfgs.append({"service": "datastore.googleapis.com",
                 "auditLogConfigs": [{"logType": "DATA_READ"}, {"logType": "DATA_WRITE"}]})
json.dump(p, open("/tmp/mc5-iam.json", "w"))
print("   auditConfigs updated (or already present)")
EOF
gcloud projects set-iam-policy medadvisor-production /tmp/mc5-iam.json --format=none --quiet
rm -f /tmp/mc5-iam.json
echo "== done — tell Claude to redeploy both envs =="
