#!/usr/bin/env bash
#
# Run ON THE OLD SERVER (account 606196119385) to bundle everything the new
# account (310792823958) needs into ONE file:
#
#   1. a fresh pg_dump of the live database (taken now, not last night)
#   2. /etc/ozirealty/env (settings, including SECRETS_KEY that unlocks the
#      credentials saved in Settings)
#   3. every object in the media bucket named by S3_BUCKET (listing photos etc.)
#
# How to run it (Session Manager / EC2 Instance Connect / SSH, as ubuntu):
#   curl -fsSL https://raw.githubusercontent.com/xempie/ozireal/master/infra/export-for-migration.sh -o /tmp/export.sh
#   sudo bash /tmp/export.sh
#
# The bundle is uploaded to the backups bucket in the old account, and the
# script prints where. Download it from the S3 console and put it in
#   e:\ESI\OZI REALTY WEBSITE\migration\
#
# The bundle holds secrets and personal data: never email it or put it in chat.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
set -a; . /etc/ozirealty/env; set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d /tmp/ozimig.XXXX)"
trap 'rm -rf "$WORK"' EXIT
REGION="${AWS_REGION:-ap-southeast-2}"
BACKUP_BUCKET="${BACKUP_BUCKET:-ozirealty-backups-606196119385}"

echo "== 1/3 database"
pg_dump --format=custom --no-owner --no-privileges --file="$WORK/db.dump" "$DATABASE_URL"
SIZE=$(stat -c%s "$WORK/db.dump")
[ "$SIZE" -gt 51200 ] || { echo "dump is only $SIZE bytes - refusing"; exit 1; }
echo "   $(numfmt --to=iec "$SIZE")"

echo "== 2/3 settings"
cp /etc/ozirealty/env "$WORK/env"
chmod 600 "$WORK/env"

echo "== 3/3 media"
if [ -n "${S3_BUCKET:-}" ]; then
  mkdir -p "$WORK/media"
  aws s3 sync "s3://$S3_BUCKET/" "$WORK/media/" --region "$REGION" --only-show-errors
  echo "   $(find "$WORK/media" -type f | wc -l) files from $S3_BUCKET"
else
  echo "   S3_BUCKET not set - no media bucket in use"
fi

# Record what is inside, so the import can check nothing is missing.
{
  echo "exported_at=$STAMP"
  echo "db_bytes=$SIZE"
  echo "media_bucket=${S3_BUCKET:-}"
  echo "media_files=$(find "$WORK/media" -type f 2>/dev/null | wc -l)"
  echo "contacts=$(psql "$DATABASE_URL" -Atc 'select count(*) from contacts')"
  echo "listings=$(psql "$DATABASE_URL" -Atc 'select count(*) from listings')"
  echo "interactions=$(psql "$DATABASE_URL" -Atc 'select count(*) from interactions')"
} > "$WORK/manifest.txt"
cat "$WORK/manifest.txt"

OUT="/tmp/ozirealty-migration-$STAMP.tgz"
tar -czf "$OUT" -C "$WORK" .
chmod 600 "$OUT"

KEY="pg/ozirealty-migration-$STAMP.tgz"
if aws s3 cp "$OUT" "s3://$BACKUP_BUCKET/$KEY" --region "$REGION" --only-show-errors; then
  rm -f "$OUT"
  echo
  echo "DONE. Download from the S3 console:"
  echo "   bucket $BACKUP_BUCKET  ->  $KEY"
else
  echo
  echo "Upload to S3 failed; the bundle is on this server at $OUT"
  echo "Download it with scp, then delete it from the server."
fi
