import 'dotenv/config';

describe('ChainId environment selection', () => {
  const originalEnvironment = process.env.ENVIRONMENT;

  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = originalEnvironment;
    jest.resetModules();
  });

  it.each(['dev', 'prod', 'production', 'staging', '', undefined])(
    'selects chain IDs for ENVIRONMENT=%s',
    (environment) => {
      if (environment === undefined) delete process.env.ENVIRONMENT;
      else process.env.ENVIRONMENT = environment;

      jest.isolateModules(() => {
        const { ChainId, SUPPORTED_QUOTE_CHAIN_IDS } =
          require('./chain.enum') as typeof import('./chain.enum');
        const expected =
          environment === 'dev'
            ? [
                11155111, 97, 80002, 421614, 11155420, 43113, 84532, 10200, 300,
                59141, 14601, 1301, 10200,
              ]
            : [
                1, 56, 137, 42161, 10, 43114, 8453, 100, 324, 59144, 146, 130,
                138,
              ];

        expect([
          ChainId.ETH,
          ChainId.BSC,
          ChainId.POL,
          ChainId.ARB,
          ChainId.OP,
          ChainId.AVAX,
          ChainId.BASE,
          ChainId.GNO,
          ChainId.ZK,
          ChainId.LINEA,
          ChainId.SONIC,
          ChainId.UNI,
          ChainId.OP138,
        ]).toEqual(expected);
        expect([
          ChainId.BNB,
          ChainId.MATIC,
          ChainId.OPT,
          ChainId.AVA,
          ChainId.BAS,
        ]).toEqual([
          ChainId.BSC,
          ChainId.POL,
          ChainId.OP,
          ChainId.AVAX,
          ChainId.BASE,
        ]);
        expect(SUPPORTED_QUOTE_CHAIN_IDS).toContain(expected[0]);
      });
    },
  );
});
