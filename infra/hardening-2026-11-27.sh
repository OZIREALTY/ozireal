#!/usr/bin/env bash
# Run once in AWS CloudShell (ap-southeast-2), account 310792823958 (owner, 2026-11-27).
#  1. The server may mirror the media bucket into the backups bucket each night.
#  2. Versioning on both buckets: a deleted or overwritten object stays recoverable.
#  3. Old versions expire after 30 days; existing lifecycle rules are kept as they are.
set -euo pipefail
REGION=ap-southeast-2
MEDIA=ozirealty-media-310792823958
BACKUPS=ozirealty-backups-310792823958
ROLE=ozirealty-instance

aws iam put-role-policy --role-name "$ROLE" --policy-name media-mirror-backup --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": \"s3:ListBucket\", \"Resource\": [\"arn:aws:s3:::$MEDIA\", \"arn:aws:s3:::$BACKUPS\"]},
    {\"Effect\": \"Allow\", \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$MEDIA/*\"},
    {\"Effect\": \"Allow\", \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::$BACKUPS/media-mirror/*\"}
  ]
}"
echo "1/3 server may mirror media: done"

for B in "$MEDIA" "$BACKUPS"; do
  aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled
  EXISTING=$(aws s3api get-bucket-lifecycle-configuration --bucket "$B" --query Rules --output json 2>/dev/null || echo "[]")
  RULES=$(echo "$EXISTING" | jq '[.[] | select(.ID != "expire-old-versions")] + [{"ID":"expire-old-versions","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":30}}]')
  aws s3api put-bucket-lifecycle-configuration --bucket "$B" --lifecycle-configuration "{\"Rules\": $RULES}"
  echo "versioning + 30-day old-version expiry on $B: done (kept $(echo "$EXISTING" | jq length) existing rule(s))"
done
echo "OZIREALTY HARDENING READY"
