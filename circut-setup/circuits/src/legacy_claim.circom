pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/circuits/utils/functions.circom";
include "@zk-email/circuits/utils/hash.circom";
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";
include "@zk-email/zk-regex-circom/circuits/common/subject_all_regex.circom";
include "circomlib/circuits/poseidon.circom";

/// @title LegacyVaultClaim
/// @notice Proves the heir controls the email address committed to in a vault,
///         and binds the payout address they chose, without revealing the email.
///
/// The heir emails the relayer with their new Stellar address in the subject.
/// The relayer holds the only DKIM-signed copy (the sender's own Sent folder is
/// unsigned), generates this proof, and submits it to the vault.
///
/// Body is deliberately not checked: everything we need is in the headers, and
/// skipping the body hash is what keeps this circuit inside the ~2M constraint
/// ceiling of the reusable BLS12-381 Powers of Tau.
///
/// @param maxHeadersLength  Max signed-header bytes. Multiple of 64.
/// @param n                 Bits per RSA chunk (121 recommended).
/// @param k                 Number of RSA chunks (17 => 2057 bits, covers RSA-2048).
/// @param maxEmailLength    Max bytes of the extracted From address.
/// @param maxSubjectLength  Max bytes of the extracted Subject.
template LegacyVaultClaim(maxHeadersLength, n, k, maxEmailLength, maxSubjectLength) {
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];

    // Where the regex matches begin. Untrusted hints: the regex itself proves
    // the match, these only say where to read it from.
    signal input fromEmailIndex;
    signal input subjectIndex;

    // The vault's public salt, passed in so the commitment can be recomputed.
    signal input heirSalt;

    /// Poseidon hash of the DKIM public key. The contract checks this against
    /// the on-chain DKIM registry for the claimed domain.
    signal output pubkeyHash;
    /// Poseidon(From address, salt) — must equal the vault's stored commitment.
    signal output commitment;
    /// The payout address, packed. Bound by the signature via the Subject.
    signal output payout[computeIntChunkLength(maxSubjectLength)];
    /// Poseidon of the signature. One email, one claim, ever.
    signal output nullifier;

    // ── 1. The expensive part: SHA-256 over the headers + RSA-2048 verify ──
    component verifier = EmailVerifier(maxHeadersLength, 0, n, k, 1, 0, 0, 0);
    verifier.emailHeader <== emailHeader;
    verifier.emailHeaderLength <== emailHeaderLength;
    verifier.pubkey <== pubkey;
    verifier.signature <== signature;
    pubkeyHash <== verifier.pubkeyHash;

    // ── 2. Extract the From address ──
    signal fromFound;
    signal fromReveal[maxHeadersLength];
    (fromFound, fromReveal) <== FromAddrRegex(maxHeadersLength)(emailHeader);
    fromFound === 1;

    signal fromPacked[computeIntChunkLength(maxEmailLength)];
    fromPacked <== PackRegexReveal(maxHeadersLength, maxEmailLength)(fromReveal, fromEmailIndex);

    // ── 3. commitment = Poseidon(From, salt) ──
    var fromChunks = computeIntChunkLength(maxEmailLength);
    component commitHash = Poseidon(fromChunks + 1);
    for (var i = 0; i < fromChunks; i++) {
        commitHash.inputs[i] <== fromPacked[i];
    }
    commitHash.inputs[fromChunks] <== heirSalt;
    commitment <== commitHash.out;

    // ── 4. Extract the Subject — this carries the payout address ──
    signal subjectFound;
    signal subjectReveal[maxHeadersLength];
    (subjectFound, subjectReveal) <== SubjectAllRegex(maxHeadersLength)(emailHeader);
    subjectFound === 1;

    payout <== PackRegexReveal(maxHeadersLength, maxSubjectLength)(subjectReveal, subjectIndex);

    // ── 5. Nullifier: the signature is unique per email, so hashing it gives
    //       a one-time token that stops the same email being replayed. ──
    nullifier <== PoseidonModular(k)(signature);
}

// No `component main` here on purpose: this file is the template. Sizes are
// chosen by build-circuit.sh, which generates a small wrapper per size. Keeping
// one copy of the logic means a variant can never drift from the source.
