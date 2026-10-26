#!/usr/bin/env bash
# Turn a raw DKIM-signed .eml into a zero-knowledge proof, then verify it.
#
#   ./prove-email.sh "/path/to/email.eml"
#
# Stages: parse + fetch DKIM key -> witness -> proof (rapidsnark) -> local verify.
# Needs a circuit already compiled and a proving key already built (Phase 2).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

EML="${1:?usage: ./prove-email.sh <file.eml>}"
EML="${EML/#\~/$HOME}"                      # allow a quoted ~ path
if [ ! -f "$EML" ]; then
  echo "no such file: $EML" >&2
  echo "recent .eml files in ~/Downloads:" >&2
  ls -t "$HOME"/Downloads/*.eml 2>/dev/null | head -5 | sed 's/^/  /' >&2
  exit 1
fi
OUT="${2:-out}"
mkdir -p "$OUT"

CIRCUIT="${CIRCUIT:-claim704}"   # override to use a different compiled circuit
ZKEY=build/${CIRCUIT}_final.zkey
WASM=build/${CIRCUIT}_js/${CIRCUIT}.wasm
VK=build/verification_key.json

step() { printf "\n\033[1m%s\033[0m\n" "$1"; }

step "1/4  read the email, verify DKIM against live DNS, build circuit inputs"
# header size is read from the compiled circuit; HEIR_SALT passes through if set
CIRCUIT="$CIRCUIT" node gen-input.mjs "$EML" "$OUT/input.json"

step "2/4  build the witness (run the circuit on those inputs)"
time node build/${CIRCUIT}_js/generate_witness.js "$WASM" "$OUT/input.json" "$OUT/witness.wtns"

step "3/4  generate the proof"
time ./bin/rapidsnark-prover "$ZKEY" "$OUT/witness.wtns" "$OUT/proof.json" "$OUT/public.json"

step "4/4  verify the proof locally"
npx snarkjs groth16 verify "$VK" "$OUT/public.json" "$OUT/proof.json"

step "what the proof makes public"
node -e '
const pub = require("./'"$OUT"'/public.json");
const dec = n => { let b = BigInt(n).toString(16); if (b.length % 2) b = "0" + b;
  return Buffer.from(b, "hex").reverse().toString("latin1").replace(/\0+$/, ""); };
const names = ["provider key hash","sender fingerprint","subject part 1","subject part 2","subject part 3","nullifier","salt"];
pub.forEach((v, i) => {
  const extra = (i >= 2 && i <= 4 && v !== "0") ? "  ->  " + JSON.stringify(dec(v)) : "";
  console.log("   " + names[i].padEnd(20) + v.slice(0, 26) + "…" + extra);
});
'
echo
echo "proof:  $OUT/proof.json   ($(wc -c < "$OUT/proof.json") bytes)"
