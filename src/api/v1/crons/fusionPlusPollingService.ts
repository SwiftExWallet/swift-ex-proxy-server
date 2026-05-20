import WebSocket from 'ws';
import {
    SDK,
    HashLock,
} from '@1inch/cross-chain-sdk';

import { randomBytes } from 'crypto';

// ============================================================
// CONFIG
// ============================================================

const API_KEY =
    process.env.ONE_INCH_API_KEY!;

const WS_URL =
    'wss://api.1inch.dev/fusion-plus/ws';

const ORDER_HASH =
    '0xYOUR_ORDER_HASH';

// ============================================================
// GENERATE SECRETS
// ============================================================

const secrets = Array.from(
    { length: 5 },
    () => randomBytes(32),
);

// secret hashes
const secretHashes = secrets.map(
    (secret) => HashLock.hashSecret(secret),
);

// ============================================================
// SDK
// ============================================================

const sdk = new SDK({
    url: 'https://api.1inch.dev/fusion-plus',
    authKey: API_KEY,
});

// ============================================================
// SECRET STATE
// ============================================================

const submittedSecrets =
    new Set<number>();

// ============================================================
// WS CONNECTION
// ============================================================

const ws = new WebSocket(
    WS_URL,
    {
        headers: {
            Authorization:
                `Bearer ${API_KEY}`,
        },
    },
);

// ============================================================
// CONNECT
// ============================================================

ws.on('open', async () => {

    console.log(
        'Fusion+ WS connected',
    );

    subscribeOrder(ORDER_HASH);
});

// ============================================================
// SUBSCRIBE ORDER
// ============================================================

function subscribeOrder(
    orderHash: string,
) {

    ws.send(
        JSON.stringify({
            action: 'subscribe',

            topic: 'order',

            filter: {
                orderHash,
            },
        }),
    );

    console.log(
        `Subscribed ${orderHash}`,
    );
}

// ============================================================
// UNSUBSCRIBE ORDER
// ============================================================

function unsubscribeOrder(
    orderHash: string,
) {

    ws.send(
        JSON.stringify({
            action: 'unsubscribe',

            topic: 'order',

            filter: {
                orderHash,
            },
        }),
    );

    console.log(
        `Unsubscribed ${orderHash}`,
    );
}

// ============================================================
// MESSAGE
// ============================================================

ws.on(
    'message',
    async (raw) => {

        try {

            const message =
                JSON.parse(
                    raw.toString(),
                );

            console.log(
                'WS EVENT:',
                JSON.stringify(
                    message,
                    null,
                    2,
                ),
            );

            const payload =
                message.payload;

            if (!payload) {
                return;
            }

            const status =
                payload.status;

            // ======================================
            // CLAIMABLE STATES
            // ======================================

            if (
                [
                    'dstEscrowCreated',
                    'filled',
                ].includes(status)
            ) {

                console.log(
                    `Checking ready fills for ${ORDER_HASH}`,
                );

                await revealReadySecrets(
                    ORDER_HASH,
                );
            }

            // ======================================
            // FINAL STATES
            // ======================================

            if (
                [
                    'claimed',
                    'refunded',
                    'expired',
                    'cancelled',
                ].includes(status)
            ) {

                console.log(
                    `Final state ${status}`,
                );

                unsubscribeOrder(
                    ORDER_HASH,
                );
            }

        } catch (e) {

            console.error(
                'WS message error',
                e,
            );
        }
    },
);

// ============================================================
// REVEAL READY SECRETS
// ============================================================

async function revealReadySecrets(
    orderHash: string,
) {

    try {

        // ======================================
        // GET READY FILLS
        // ======================================

        const readyFills =
            await sdk.getReadyToAcceptSecretFills(
                orderHash,
            );

        console.log(
            'READY FILLS:',
            JSON.stringify(
                readyFills,
                null,
                2,
            ),
        );

        // ======================================
        // LOOP READY FILLS
        // ======================================

        for (
            const fill
            of readyFills.fills
        ) {

            const idx =
                fill.idx;

            // ------------------------------
            // already submitted
            // ------------------------------

            if (
                submittedSecrets.has(
                    idx,
                )
            ) {

                console.log(
                    `Secret ${idx} already submitted`,
                );

                continue;
            }

            // ------------------------------
            // get secret
            // ------------------------------

            const secret =
                secrets[idx];

            if (!secret) {

                console.log(
                    `Secret missing for idx ${idx}`,
                );

                continue;
            }

            console.log(
                `Submitting secret idx=${idx}`,
            );

            // ==================================
            // SUBMIT SECRET
            // ==================================

            await sdk.submitSecret(
                orderHash,
                secret,
            );

            console.log(
                `Secret submitted idx=${idx}`,
            );

            // ==================================
            // MARK SUBMITTED
            // ==================================

            submittedSecrets.add(
                idx,
            );
        }

    } catch (e) {

        console.error(
            'Reveal secret error',
            e,
        );
    }
}

// ============================================================
// ERROR
// ============================================================

ws.on(
    'error',
    (err) => {

        console.error(
            'WS ERROR',
            err,
        );
    },
);

// ============================================================
// CLOSE
// ============================================================

ws.on(
    'close',
    () => {

        console.log(
            'WS disconnected',
        );
    },
);