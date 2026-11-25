#!/usr/bin/env bash
#
# Run in AWS CloudShell, signed in to account 310792823958, region Sydney.
#
#   curl -fsSL https://raw.githubusercontent.com/OZIREALTY/ozireal/master/infra/cloudshell-setup.sh -o setup.sh
#   bash setup.sh
#
# Safe to run more than once. It:
#   1. reports SES production access (the welcome emails depend on it)
#   2. lets the app server send through SES and read inbound mail
#   3. sets up the reply inbox: reply+<item>@in.ozirealty.com.au
#        SES receipt rule -> raw mail to S3 -> SNS -> https://crm.ozirealty.com.au/api/inbound/ses
#      plus the MX record for in.ozirealty.com.au ONLY. The main domain's MX
#      (the agency's normal email) is never touched.
set -euo pipefail

R=ap-southeast-2
ACCT=310792823958
ROLE=ozirealty-instance
DOMAIN=ozirealty.com.au
IN=in.$DOMAIN
BUCKET=ozirealty-inbound-$ACCT
TOPIC=ozirealty-inbound
RULESET=ozirealty
ENDPOINT=https://crm.$DOMAIN/api/inbound/ses

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

[ "$(aws sts get-caller-identity --query Account --output text)" = "$ACCT" ] \
  || { echo "This is not account $ACCT - switch account first."; exit 1; }

say "1. SES status"
aws sesv2 get-account --region $R \
  --query '{ProductionAccess:ProductionAccessEnabled,SendingEnabled:SendingEnabled,Max24h:SendQuota.Max24HourSend}' --output table
echo "Identities:"
aws sesv2 list-email-identities --region $R --query 'EmailIdentities[].[IdentityName,VerificationStatus]' --output text

say "2. App server permissions"
cat > /tmp/policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "SendMail", "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "arn:aws:ses:$R:$ACCT:*" },
    { "Sid": "ReadSesStatus", "Effect": "Allow",
      "Action": ["ses:GetAccount", "ses:ListEmailIdentities"], "Resource": "*" },
    { "Sid": "ReadInboundMail", "Effect": "Allow",
      "Action": "s3:GetObject", "Resource": "arn:aws:s3:::$BUCKET/*" }
  ]
}
EOF
aws iam put-role-policy --role-name $ROLE --policy-name ozirealty-mail --policy-document file:///tmp/policy.json
echo "ok: $ROLE can send through SES and read $BUCKET"

say "3a. Inbound mail bucket"
if ! aws s3api head-bucket --bucket $BUCKET 2>/dev/null; then
  aws s3api create-bucket --bucket $BUCKET --region $R --create-bucket-configuration LocationConstraint=$R >/dev/null
fi
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $BUCKET \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# Replies are copied into the CRM; the raw mail only needs to live long enough to be read.
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET \
  --lifecycle-configuration '{"Rules":[{"ID":"expire","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":90}}]}'
cat > /tmp/bucket.json <<EOF
{ "Version": "2012-10-17", "Statement": [ {
  "Sid": "SesPut", "Effect": "Allow", "Principal": { "Service": "ses.amazonaws.com" },
  "Action": "s3:PutObject", "Resource": "arn:aws:s3:::$BUCKET/*",
  "Condition": { "StringEquals": { "AWS:SourceAccount": "$ACCT" } } } ] }
EOF
aws s3api put-bucket-policy --bucket $BUCKET --policy file:///tmp/bucket.json
echo "ok: $BUCKET (private, encrypted, mail kept 90 days)"

say "3b. Notification topic"
TOPIC_ARN=$(aws sns create-topic --name $TOPIC --region $R --query TopicArn --output text)
cat > /tmp/topic.json <<EOF
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow", "Principal": { "Service": "ses.amazonaws.com" },
  "Action": "SNS:Publish", "Resource": "$TOPIC_ARN",
  "Condition": { "StringEquals": { "AWS:SourceAccount": "$ACCT" } } } ] }
EOF
aws sns set-topic-attributes --region $R --topic-arn "$TOPIC_ARN" --attribute-name Policy --attribute-value file:///tmp/topic.json
if ! aws sns list-subscriptions-by-topic --region $R --topic-arn "$TOPIC_ARN" \
     --query "Subscriptions[?Endpoint=='$ENDPOINT' && SubscriptionArn!='PendingConfirmation'].SubscriptionArn" --output text | grep -q arn; then
  aws sns subscribe --region $R --topic-arn "$TOPIC_ARN" --protocol https --notification-endpoint "$ENDPOINT" >/dev/null
fi
echo "ok: $TOPIC_ARN -> $ENDPOINT"

say "3c. Verify $IN with SES"
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name $DOMAIN --query "HostedZones[?Name=='$DOMAIN.'].Id | [0]" --output text | sed 's#/hostedzone/##')
[ -n "$ZONE" ] && [ "$ZONE" != None ] || { echo "No Route 53 zone for $DOMAIN in this account."; exit 1; }
aws sesv2 get-email-identity --region $R --email-identity $IN >/dev/null 2>&1 \
  || aws sesv2 create-email-identity --region $R --email-identity $IN >/dev/null
TOKENS=$(aws sesv2 get-email-identity --region $R --email-identity $IN --query 'DkimAttributes.Tokens' --output text)
CHANGES=""
for t in $TOKENS; do
  CHANGES="$CHANGES{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$t._domainkey.$IN\",\"Type\":\"CNAME\",\"TTL\":1800,\"ResourceRecords\":[{\"Value\":\"$t.dkim.amazonses.com\"}]}},"
done
# MX for the in. SUBDOMAIN only.
CHANGES="$CHANGES{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$IN\",\"Type\":\"MX\",\"TTL\":300,\"ResourceRecords\":[{\"Value\":\"10 inbound-smtp.$R.amazonaws.com\"}]}}"
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" \
  --change-batch "{\"Comment\":\"OziRealty reply inbox\",\"Changes\":[$CHANGES]}" >/dev/null
echo "ok: DKIM records and MX for $IN added in zone $ZONE"

say "3d. Receipt rule"
ACTIVE=$(aws ses describe-active-receipt-rule-set --region $R --query Metadata.Name --output text 2>/dev/null || true)
if [ -z "$ACTIVE" ] || [ "$ACTIVE" = None ]; then
  aws ses create-receipt-rule-set --region $R --rule-set-name $RULESET 2>/dev/null || true
  aws ses set-active-receipt-rule-set --region $R --rule-set-name $RULESET
  ACTIVE=$RULESET
fi
RULE="{\"Name\":\"ozirealty-replies\",\"Enabled\":true,\"TlsPolicy\":\"Require\",\"ScanEnabled\":true,\"Recipients\":[\"$IN\"],\"Actions\":[{\"S3Action\":{\"BucketName\":\"$BUCKET\",\"ObjectKeyPrefix\":\"mail/\",\"TopicArn\":\"$TOPIC_ARN\"}}]}"
if aws ses describe-receipt-rule --region $R --rule-set-name "$ACTIVE" --rule-name ozirealty-replies >/dev/null 2>&1; then
  aws ses update-receipt-rule --region $R --rule-set-name "$ACTIVE" --rule "$RULE"
else
  aws ses create-receipt-rule --region $R --rule-set-name "$ACTIVE" --rule "$RULE"
fi
echo "ok: rule ozirealty-replies in active rule set $ACTIVE"

say "Done"
echo "SES status is in section 1 above. If ProductionAccess is False, request it:"
echo "  SES console -> Account dashboard -> Request production access"
echo "The SNS subscription confirms itself within a minute; check with:"
echo "  aws sns list-subscriptions-by-topic --region $R --topic-arn $TOPIC_ARN"
