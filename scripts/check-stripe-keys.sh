#!/usr/bin/env bash
#
# Say which Stripe key is in which secret, by name, before anything uses one.
#
# The end-to-end test reads STRIPE_TEST_SECRET_KEY and falls back to
# STRIPE_SECRET_KEY, then refuses to run unless what it got is a test key. That
# refusal is correct — the test buys something and refunds it — but its message
# names the *variable the script received*, not the *secret the value came
# from*. Both are called STRIPE_SECRET_KEY inside the script, so
#
#     refusing to run: STRIPE_SECRET_KEY is a LIVE key
#
# reads identically whether the fallback fired or whether STRIPE_TEST_SECRET_KEY
# itself holds a live key. On 2026-08-27 it was the second, and the run before
# it was the first, and nothing in the log told them apart. Two rounds of
# guessing at a two-second failure.
#
# So: classify both, by name, before the test starts.
#
# What this prints is the documented key *prefix family* — Stripe publishes
# these, they identify mode and kind, and they are not the secret material.
# Neither value is ever echoed, and the length is not printed either, since
# for a key it is fixed by the kind and adds nothing.

set -uo pipefail

classify() {
  case "${1:-}" in
    '')          echo "not set" ;;
    sk_test_*)   echo "test secret key — usable" ;;
    rk_test_*)   echo "test restricted key — usable" ;;
    sk_live_*)   echo "LIVE secret key — the test will refuse this" ;;
    rk_live_*)   echo "LIVE restricted key — the test will refuse this" ;;
    pk_test_*)   echo "test PUBLISHABLE key — wrong kind, this is the public one" ;;
    pk_live_*)   echo "live PUBLISHABLE key — wrong kind, this is the public one" ;;
    whsec_*)     echo "a webhook signing secret — wrong secret entirely" ;;
    *)           echo "unrecognised — not a Stripe key prefix" ;;
  esac
}

test_key="${SECRET_STRIPE_TEST_SECRET_KEY:-}"
live_key="${SECRET_STRIPE_SECRET_KEY:-}"

echo "STRIPE_TEST_SECRET_KEY : $(classify "$test_key")"
echo "STRIPE_SECRET_KEY      : $(classify "$live_key")"

# Which one the test will actually be handed, mirroring the workflow's
# `secrets.STRIPE_TEST_SECRET_KEY || secrets.STRIPE_SECRET_KEY`.
if [ -n "$test_key" ]; then
  chosen="$test_key"
  source_name="STRIPE_TEST_SECRET_KEY"
else
  chosen="$live_key"
  source_name="STRIPE_SECRET_KEY (fallback — no dedicated test key set)"
fi

echo
echo "The test will use: $source_name"

case "$chosen" in
  sk_test_*|rk_test_*)
    echo "That is a test key. Proceeding."
    ;;
  '')
    echo "::error::No Stripe key at all. Add a test-mode secret key as STRIPE_TEST_SECRET_KEY under Settings -> Secrets and variables -> Actions."
    exit 1
    ;;
  *)
    echo "::error::$source_name does not hold a test-mode secret key, so the purchase test cannot run. It buys a guide and refunds it, which on a live key is real money. Copy the Secret key from the BBA Network **sandbox** account (Developers -> API keys) into STRIPE_TEST_SECRET_KEY. Check the account name in the top-left first: the sandbox is a separate account, not test mode on the main one."
    exit 1
    ;;
esac
