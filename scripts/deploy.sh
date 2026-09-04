#!/usr/bin/env bash
set -euo pipefail

stage="${1:-production}"

# SST/OpenNext owns the deployment, asset bucket, ISR cache, and SQS
# revalidator. Keep those resources intact and let SST update them.
npx sst deploy --stage "$stage"

# Retain the explicit post-deploy CloudFront invalidation. Resolve the current
# distribution by its primary alias so this remains correct after replacement.
distribution_id="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?@=='aaronrohrbacher.com']].Id | [0]" \
  --output text)"

if [[ -z "$distribution_id" || "$distribution_id" == "None" ]]; then
  echo "Could not resolve the portfolio CloudFront distribution." >&2
  exit 1
fi

invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "$distribution_id" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)"

aws cloudfront wait invalidation-completed \
  --distribution-id "$distribution_id" \
  --id "$invalidation_id"

node scripts/verify-production.mjs
