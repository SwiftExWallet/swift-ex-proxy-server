import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanDataBuilder,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';

// Ephemeral test keys only. Production never creates or receives user keys.
export const signer = Keypair.random();
export const wallet = signer.publicKey();
export const tokenIn = StrKey.encodeContract(Buffer.alloc(32, 1));
export const tokenOut = StrKey.encodeContract(Buffer.alloc(32, 2));
export const router = StrKey.encodeContract(Buffer.alloc(32, 3));
export const quoteRequest = {
  assetIn: tokenIn,
  assetOut: tokenOut,
  amount: '10000000',
  slippageBps: 50,
};
export const normalizedQuote = {
  assetIn: tokenIn,
  assetOut: tokenOut,
  amountIn: '10000000',
  expectedAmountOut: '20000000',
  minimumAmountOut: '19900000',
  route: [tokenIn, tokenOut],
};
export const providerQuote = {
  assetIn: tokenIn,
  assetOut: tokenOut,
  amountIn: '10000000',
  amountOut: '20000000',
  otherAmountThreshold: '19900000',
  tradeType: 'EXACT_IN',
  platform: 'router',
  routePlan: [
    {
      swapInfo: { protocol: 'soroswap', path: [tokenIn, tokenOut] },
      percent: '100',
    },
  ],
  rawTrade: {
    amountIn: '10000000',
    amountOutMin: '19900000',
    path: [tokenIn, tokenOut],
  },
};

export function invocation() {
  return new Contract(router).call(
    'swap_exact_tokens_for_tokens',
    nativeToScVal(10000000n, { type: 'i128' }),
    nativeToScVal(19900000n, { type: 'i128' }),
    xdr.ScVal.scvVec([
      new Address(tokenIn).toScVal(),
      new Address(tokenOut).toScVal(),
    ]),
    new Address(wallet).toScVal(),
    nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 180), { type: 'u64' }),
  );
}

export function simulation(): rpc.Api.SimulateTransactionSuccessResponse {
  const root = new xdr.SorobanAuthorizedInvocation({
    function:
      xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        invocation()
          .body()
          .invokeHostFunctionOp()
          .hostFunction()
          .invokeContract(),
      ),
    subInvocations: [],
  });
  return {
    _parsed: true,
    id: 'simulation',
    latestLedger: 100,
    events: [],
    minResourceFee: '1000',
    transactionData: new SorobanDataBuilder()
      .setResources(100000, 1000, 1000)
      .setReadOnly([
        xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(router).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        ),
      ])
      .setResourceFee('1000'),
    result: {
      retval: nativeToScVal([10000000n, 20000000n], { type: 'i128' }),
      auth: [
        new xdr.SorobanAuthorizationEntry({
          credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
          rootInvocation: root,
        }),
      ],
    },
  };
}

export function preparedTransaction(
  passphrase = Networks.TESTNET,
): Transaction {
  const tx = new TransactionBuilder(new Account(wallet, '100'), {
    fee: '100',
    networkPassphrase: passphrase,
  })
    .addOperation(invocation())
    .setTimeout(180)
    .build();
  return rpc.assembleTransaction(tx, simulation()).build();
}

export function nativeSign(
  unsignedXdr: string,
  passphrase = Networks.TESTNET,
): string {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, passphrase);
  const signature = signer.sign(tx.hash()).toString('base64');
  tx.addSignature(wallet, Buffer.from(signature, 'base64').toString('base64'));
  return tx.toXDR();
}
