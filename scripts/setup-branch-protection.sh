#!/usr/bin/env bash
set -euo pipefail

# Setup script for GitHub branch protection and environment protection rules.
# Configures: branch protection on main + staging, required reviewer on Production environment.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated with admin access
#   - Staging branch must exist (created in Phase 28)
#   - Repository secrets NEON_API_KEY, NEON_PROJECT_ID, NEON_PROD_BRANCH_ID configured
#
# Usage: bash scripts/setup-branch-protection.sh

OWNER="RyRy79261"
REPO="intake-tracker"
REQUIRED_CHECK="ci-pass"

echo "=== Deployment Protection Setup ==="
echo ""

# Verify gh CLI is authenticated
if ! gh auth status &>/dev/null; then
  echo "ERROR: GitHub CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi

# Get authenticated user ID for environment reviewer
USER_ID=$(gh api user --jq '.id')
USERNAME=$(gh api user --jq '.login')
echo "Authenticated as: $USERNAME (ID: $USER_ID)"
echo ""

# --- Branch Protection: main ---
echo "--- Configuring branch protection: main ---"
gh api "repos/$OWNER/$REPO/branches/main/protection" \
  --method PUT \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$REQUIRED_CHECK"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": false
  },
  "restrictions": null
}
EOF
echo "✓ Branch protection configured for main"
echo ""

# --- Branch Protection: staging ---
echo "--- Configuring branch protection: staging ---"

# Check if staging branch exists
if ! gh api "repos/$OWNER/$REPO/branches/staging" --jq '.name' &>/dev/null; then
  echo "⚠ Staging branch does not exist yet."
  echo "  Branch protection for staging will need to be applied after Phase 28 creates the branch."
  echo "  Re-run this script after staging branch is created."
  echo ""
else
  gh api "repos/$OWNER/$REPO/branches/staging/protection" \
    --method PUT \
    --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$REQUIRED_CHECK"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": false
  },
  "restrictions": null
}
EOF
  echo "✓ Branch protection configured for staging"
  echo ""
fi

# --- Environment Protection: Production ---
echo "--- Configuring Production environment protection ---"
gh api "repos/$OWNER/$REPO/environments/Production" \
  --method PUT \
  --input - <<EOF
{
  "reviewers": [
    {
      "type": "User",
      "id": $USER_ID
    }
  ],
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
EOF
echo "✓ Production environment configured with required reviewer: $USERNAME"
echo ""

# --- Verification ---
echo "=== Verification ==="
echo ""

# Check main protection
MAIN_CHECKS=$(gh api "repos/$OWNER/$REPO/branches/main/protection/required_status_checks" --jq '.contexts[]' 2>/dev/null || echo "FAILED")
MAIN_ADMIN=$(gh api "repos/$OWNER/$REPO/branches/main/protection" --jq '.enforce_admins.enabled' 2>/dev/null || echo "FAILED")
MAIN_REVIEWS=$(gh api "repos/$OWNER/$REPO/branches/main/protection/required_pull_request_reviews" --jq '.required_approving_review_count' 2>/dev/null || echo "FAILED")

echo "Main branch:"
echo "  Required checks: $MAIN_CHECKS (expected: $REQUIRED_CHECK)"
echo "  Enforce admins: $MAIN_ADMIN (expected: true)"
echo "  Required reviews: $MAIN_REVIEWS (expected: 1)"

if [ "$MAIN_CHECKS" = "$REQUIRED_CHECK" ] && [ "$MAIN_ADMIN" = "true" ] && [ "$MAIN_REVIEWS" = "1" ]; then
  echo "  ✓ Main branch protection PASSED"
else
  echo "  ✗ Main branch protection FAILED — check output above"
fi
echo ""

# Check staging protection (if branch exists)
if gh api "repos/$OWNER/$REPO/branches/staging" --jq '.name' &>/dev/null; then
  STAGING_CHECKS=$(gh api "repos/$OWNER/$REPO/branches/staging/protection/required_status_checks" --jq '.contexts[]' 2>/dev/null || echo "FAILED")
  STAGING_ADMIN=$(gh api "repos/$OWNER/$REPO/branches/staging/protection" --jq '.enforce_admins.enabled' 2>/dev/null || echo "FAILED")
  STAGING_REVIEWS=$(gh api "repos/$OWNER/$REPO/branches/staging/protection/required_pull_request_reviews" --jq '.required_approving_review_count' 2>/dev/null || echo "FAILED")

  echo "Staging branch:"
  echo "  Required checks: $STAGING_CHECKS (expected: $REQUIRED_CHECK)"
  echo "  Enforce admins: $STAGING_ADMIN (expected: true)"
  echo "  Required reviews: $STAGING_REVIEWS (expected: 1)"

  if [ "$STAGING_CHECKS" = "$REQUIRED_CHECK" ] && [ "$STAGING_ADMIN" = "true" ] && [ "$STAGING_REVIEWS" = "1" ]; then
    echo "  ✓ Staging branch protection PASSED"
  else
    echo "  ✗ Staging branch protection FAILED — check output above"
  fi
else
  echo "Staging branch: ⚠ skipped (branch does not exist yet)"
fi
echo ""

# Check Production environment
ENV_REVIEWERS=$(gh api "repos/$OWNER/$REPO/environments/Production" --jq '.protection_rules[] | select(.type == "required_reviewers") | .reviewers[].reviewer.login' 2>/dev/null || echo "NONE")
echo "Production environment:"
echo "  Required reviewers: $ENV_REVIEWERS (expected: $USERNAME)"

if [ "$ENV_REVIEWERS" = "$USERNAME" ]; then
  echo "  ✓ Production environment protection PASSED"
else
  echo "  ✗ Production environment protection FAILED — check output above"
fi
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Notes:"
echo "  - Branch protection requires PRs with CI passing and 1 approval to merge"
echo "  - Admin enforcement means even repo owners must use PRs (D-02)"
echo "  - To temporarily disable for emergencies: Settings > Branches > Edit rule"
echo "  - Production environment requires your approval for promotion workflow jobs"
