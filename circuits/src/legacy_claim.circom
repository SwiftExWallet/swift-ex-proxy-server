pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/circuits/utils/functions.circom";
include "@zk-email/circuits/utils/hash.circom";
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";
include "@zk-email/zk-regex-circom/circuits/common/subject_all_regex.circom";
include "circomlib/circuits/poseidon.circom";

template LegacyVaultClaim(maxHeadersLength, n, k, maxEmailLength, maxSubjectLength) {
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];
    signal input fromEmailIndex;
    signal input subjectIndex;
    signal input heirSalt;

    signal output pubkeyHash;
    signal output commitment;
    signal output payout[computeIntChunkLength(maxSubjectLength)];
    signal output nullifier;

    component verifier = EmailVerifier(maxHeadersLength, 0, n, k, 1, 0, 0, 0);
    verifier.emailHeader <== emailHeader;
    verifier.emailHeaderLength <== emailHeaderLength;
    verifier.pubkey <== pubkey;
    verifier.signature <== signature;
    pubkeyHash <== verifier.pubkeyHash;

    signal fromFound;
    signal fromReveal[maxHeadersLength];
    (fromFound, fromReveal) <== FromAddrRegex(maxHeadersLength)(emailHeader);
    fromFound === 1;

    signal fromPacked[computeIntChunkLength(maxEmailLength)];
    fromPacked <== PackRegexReveal(maxHeadersLength, maxEmailLength)(fromReveal, fromEmailIndex);

    var fromChunks = computeIntChunkLength(maxEmailLength);
    component commitHash = Poseidon(fromChunks + 1);
    for (var i = 0; i < fromChunks; i++) {
        commitHash.inputs[i] <== fromPacked[i];
    }
    commitHash.inputs[fromChunks] <== heirSalt;
    commitment <== commitHash.out;

    signal subjectFound;
    signal subjectReveal[maxHeadersLength];
    (subjectFound, subjectReveal) <== SubjectAllRegex(maxHeadersLength)(emailHeader);
    subjectFound === 1;

    payout <== PackRegexReveal(maxHeadersLength, maxSubjectLength)(subjectReveal, subjectIndex);
    nullifier <== PoseidonModular(k)(signature);
}
