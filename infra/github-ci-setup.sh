#!/usr/bin/env bash
#
# One-time AWS setup for building on GitHub (2026-11-25). Run in AWS CloudShell,
# account 310792823958:
#
#   bash github-ci-setup.sh
#
# Creates, keylessly (no access key is ever made):
#   1. GitHub's OIDC identity provider in this account (if missing).
#   2. Role ozirealty-github-ci, which ONLY the master branch of OZIREALTY/ozireal can
#      assume, and which can ONLY write s3://ozirealty-backups-310792823958/builds/*.
#   3. Read access to builds/* for the server's role (ozirealty-instance).
#   4. A lifecycle rule: builds/ older than 14 days are deleted (storage never grows).
# Safe to run twice.
set -euo pipefail

ACCOUNT=310792823958
BUCKET=ozirealty-backups-$ACCOUNT
REPO=OZIREALTY/ozireal
# GitHub now puts the immutable owner and repo IDs in the OIDC subject (seen in
# CloudTrail, 2026-11-25). Matching the IDs is stricter than the name: a deleted and
# re-created repo of the same name gets different IDs, so it cannot assume the role.
SUBJECT="repo:OZIREALTY@324348989/ozireal@1471125852:ref:refs/heads/master"
ROLE=ozirealty-github-ci
INSTANCE_ROLE=ozirealty-instance
OIDC=token.actions.githubusercontent.com

if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::$ACCOUNT:oidc-provider/$OIDC" >/dev/null 2>&1; then
  aws iam create-open-id-connect-provider --url "https://$OIDC" --client-id-list sts.amazonaws.com >/dev/null
  echo "created GitHub OIDC provider"
fi

cat > /tmp/trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Federated":"arn:aws:iam::$ACCOUNT:oidc-provider/$OIDC"},
 "Action":"sts:AssumeRoleWithWebIdentity",
 "Condition":{
  "StringEquals":{"$OIDC:aud":"sts.amazonaws.com","$OIDC:sub":"$SUBJECT"}}}]}
JSON
if aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name $ROLE --policy-document file:///tmp/trust.json
else
  aws iam create-role --role-name $ROLE --assume-role-policy-document file:///tmp/trust.json \
    --description "GitHub Actions: upload build bundles only" >/dev/null
  echo "created role $ROLE"
fi
cat > /tmp/ci.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:PutObject",
 "Resource":"arn:aws:s3:::$BUCKET/builds/*"}]}
JSON
aws iam put-role-policy --role-name $ROLE --policy-name upload-builds --policy-document file:///tmp/ci.json

cat > /tmp/read.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject",
 "Resource":"arn:aws:s3:::$BUCKET/builds/*"}]}
JSON
aws iam put-role-policy --role-name $INSTANCE_ROLE --policy-name read-builds --policy-document file:///tmp/read.json

# Keep the existing lifecycle rules and add (or replace) the builds/ one.
EXISTING=$(aws s3api get-bucket-lifecycle-configuration --bucket $BUCKET --query Rules --output json 2>/dev/null || echo "[]")
python3 - "$EXISTING" > /tmp/lc.json <<'PY'
import json, sys
rules = [r for r in json.loads(sys.argv[1] or "[]") if r.get("ID") != "expire-builds"]
rules.append({"ID": "expire-builds", "Status": "Enabled", "Filter": {"Prefix": "builds/"},
              "Expiration": {"Days": 14}})
print(json.dumps({"Rules": rules}))
PY
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration file:///tmp/lc.json

echo "GITHUB CI READY: role arn:aws:iam::$ACCOUNT:role/$ROLE"
