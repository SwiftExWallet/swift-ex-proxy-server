#!/usr/bin/env bash
# Development-only Phase 2 contribution, proof, verification, and verifier generation.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export NODE_OPTIONS="--max-old-space-size=12288"

SN="npx snarkjs"
C="${CIRCUIT:-claim704}"
W="${WITNESS:-build/witness704.wtns}"

echo "==> phase 2 contribution (development only)"
$SN zkey contribute build/${C}_0000.zkey build/${C}_final.zkey \
  --name="legacy-vault-dev" -v -e="$(openssl rand -hex 32)"

echo "==> export verification key"
$SN zkey export verificationkey build/${C}_final.zkey build/verification_key.json

echo "==> generate proof from the real email"
$SN groth16 prove build/${C}_final.zkey "$W" \
  build/proof.json build/public.json

echo "==> verify locally"
$SN groth16 verify build/verification_key.json build/public.json build/proof.json

echo "==> public signals"
cat build/public.json

echo "==> generate the Soroban verifier contract"
soroban-verifier-gen \
  --vk build/verification_key.json \
  --proof build/proof.json \
  --public build/public.json \
  --out "$(cd .. && pwd)/contracts/zkverifier" \
  --crate-name legacy-zk-verifier \
  --contract-name ZkEmailGroth16Verifier \
  --soroban-sdk-version v27 \
  --force

echo "done."
