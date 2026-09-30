
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import {
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Horizon,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';

import {
  BroadcastSoroswapDto,
  SoroswapQuoteDto,
} from './dto/soroswap.dto';

// ---------------------------------------
// VERIFIED SOROSWAP TESTNET CONTRACTS
// ---------------------------------------

const NETWORK = Networks.TESTNET;

const ROUTER =
  'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD';

const POOL =
  'CDSQONFE5BS732OYYJINI2L7W4567XRBLJWDD7GPVQZLXLPC4CGA55ZO';

const USDC =
  'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F';

const XTAR =
  'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2';

const BPS = 10_000n;

// Assumed 0.3% fee.
// Verify against deployed contract.
const ASSUMED_FEE_BPS = 30n;

// 1% slippage
const SLIPPAGE_BPS = 100n;

const SWAP_EXPIRY_MS = 5 * 60 * 1000;

type PendingSwap = {
  walletAddress: string;
  expiresAt: number;
};

type DirectQuote = {
  network: 'TESTNET';
  protocol: 'SOROSWAP';
  quoteType: 'INDICATIVE';

  pool: string;
  router: string;

  assetIn: string;
  assetOut: string;

  amountIn: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;

  amountInFormatted: string;
  estimatedAmountOutFormatted: string;
  minimumAmountOutFormatted: string;

  decimalsIn: number;
  decimalsOut: number;

  assumedFeeBps: number;
  slippageBps: number;
};

@Injectable()
export class SoroswapService {
  private readonly logger = new Logger(
    SoroswapService.name,
  );

  private readonly server: rpc.Server;
  private readonly horizon: Horizon.Server;

  private readonly queryAccount: string;

  // Development-only storage.
  // Use Redis or DB for production.
  private readonly pendingSwaps =
    new Map<string, PendingSwap>();

  constructor() {
    if (
      process.env.SOROSWAP_ENVIRONMENT !== 'dev'
    ) {
      throw new Error(
        'This service currently supports TESTNET only',
      );
    }

    this.queryAccount =
      process.env.SOROSWAP_QUERY_ACCOUNT || '';

    if (!this.queryAccount) {
      throw new Error(
        'SOROSWAP_QUERY_ACCOUNT is required',
      );
    }

    this.validateWallet(this.queryAccount);

    this.server = new rpc.Server(
      process.env.STELLAR_RPC_URL ||
        'https://soroban-testnet.stellar.org',
    );

    this.horizon = new Horizon.Server(
      process.env.STELLAR_HORIZON_URL ||
        'https://horizon-testnet.stellar.org',
    );
  }

  // ---------------------------------------
  // VALIDATION
  // ---------------------------------------

  private validateWallet(
    walletAddress: string,
  ): void {
    if (
      !walletAddress ||
      !/^G[A-Z2-7]{55}$/.test(walletAddress)
    ) {
      throw new BadRequestException(
        'Valid Stellar public wallet address is required',
      );
    }

    try {
      new Address(walletAddress);
    } catch {
      throw new BadRequestException(
        'Invalid Stellar wallet address',
      );
    }
  }

  private validatePair(
    assetIn: string,
    assetOut: string,
  ): void {
    const supported =
      (assetIn === USDC && assetOut === XTAR) ||
      (assetIn === XTAR && assetOut === USDC);

    if (!supported) {
      throw new BadRequestException({
        message:
          'Only the verified Testnet USDC/XTAR pool is supported',
        supportedTokens: {
          USDC,
          XTAR,
        },
      });
    }
  }

  // ---------------------------------------
  // AMOUNT HELPERS
  // ---------------------------------------

  private toBaseUnits(
    amount: string,
    decimals: number,
  ): bigint {
    if (
      typeof amount !== 'string' ||
      !/^\d+(\.\d+)?$/.test(amount)
    ) {
      throw new BadRequestException(
        'Invalid amount',
      );
    }

    const [whole, fraction = ''] =
      amount.split('.');

    if (fraction.length > decimals) {
      throw new BadRequestException(
        `Amount supports maximum ${decimals} decimal places`,
      );
    }

    const padded = fraction.padEnd(
      decimals,
      '0',
    );

    return (
      BigInt(whole) *
        10n ** BigInt(decimals) +
      BigInt(padded || '0')
    );
  }

  private formatUnits(
    amount: bigint,
    decimals: number,
  ): string {
    const base =
      10n ** BigInt(decimals);

    const whole = amount / base;

    const fraction = (amount % base)
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '');

    return (
      whole.toString() +
      (fraction ? `.${fraction}` : '')
    );
  }

  private async readContract(
    contractAddress: string,
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const account =
      await this.horizon.loadAccount(
        this.queryAccount,
      );

    const contract =
      new Contract(contractAddress);

    const scValArgs = Object.values(args).map(
      (value) => {
        if (
          typeof value === 'string' &&
          /^[GC][A-Z2-7]{55}$/.test(value)
        ) {
          return new Address(
            value,
          ).toScVal();
        }

        if (
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 0
        ) {
          return nativeToScVal(
            value,
            { type: 'u32' },
          );
        }

        if (
          typeof value === 'bigint'
        ) {
          return nativeToScVal(
            value,
            { type: 'u64' },
          );
        }

        throw new BadRequestException(
          `Unsupported argument for ${method}`,
        );
      },
    );

    const tx = new TransactionBuilder(
      account,
      {
        fee: BASE_FEE,
        networkPassphrase: NETWORK,
      },
    )
      .addOperation(
        contract.call(
          method,
          ...scValArgs,
        ),
      )
      .setTimeout(30)
      .build();

    const simulation =
      await this.server.simulateTransaction(
        tx,
      );

    if (
      rpc.Api.isSimulationError(
        simulation,
      )
    ) {
      throw new BadRequestException({
        message:
          `Contract query failed: ${method}`,
        details: simulation.error,
      });
    }

    if (
      !rpc.Api.isSimulationSuccess(
        simulation,
      ) ||
      !simulation.result
    ) {
      throw new BadRequestException(
        `Contract query returned no result: ${method}`,
      );
    }

    return scValToNative(
      simulation.result.retval,
    );
  }

  async quote(
    dto: SoroswapQuoteDto,
  ): Promise<DirectQuote> {
    try {
      this.validatePair(
        dto.assetIn,
        dto.assetOut,
      );

      const [
        token0Raw,
        token1Raw,
        reservesRaw,
        decimalsInRaw,
        decimalsOutRaw,
      ] = await Promise.all([
        this.readContract(
          POOL,
          'token_0',
        ),
        this.readContract(
          POOL,
          'token_1',
        ),
        this.readContract(
          POOL,
          'get_reserves',
        ),
        this.readContract(
          dto.assetIn,
          'decimals',
        ),
        this.readContract(
          dto.assetOut,
          'decimals',
        ),
      ]);

      const token0 = String(token0Raw);
      const token1 = String(token1Raw);

      if (
        !Array.isArray(reservesRaw) ||
        reservesRaw.length < 2
      ) {
        throw new BadRequestException(
          'Invalid pool reserves',
        );
      }

      const reserve0 =
        BigInt(String(reservesRaw[0]));

      const reserve1 =
        BigInt(String(reservesRaw[1]));

      const decimalsIn =
        Number(decimalsInRaw);

      const decimalsOut =
        Number(decimalsOutRaw);

      if (
        !Number.isInteger(decimalsIn) ||
        !Number.isInteger(decimalsOut) ||
        decimalsIn < 0 ||
        decimalsOut < 0
      ) {
        throw new BadRequestException(
          'Invalid token decimals',
        );
      }

      let reserveIn: bigint;
      let reserveOut: bigint;

      if (
        token0 === dto.assetIn &&
        token1 === dto.assetOut
      ) {
        reserveIn = reserve0;
        reserveOut = reserve1;
      } else if (
        token1 === dto.assetIn &&
        token0 === dto.assetOut
      ) {
        reserveIn = reserve1;
        reserveOut = reserve0;
      } else {
        throw new BadRequestException(
          'Pool token mismatch',
        );
      }

      if (
        reserveIn <= 0n ||
        reserveOut <= 0n
      ) {
        throw new BadRequestException(
          'Pool has insufficient liquidity',
        );
      }

      const amountIn =
        this.toBaseUnits(
          dto.amount,
          decimalsIn,
        );

      if (amountIn <= 0n) {
        throw new BadRequestException(
          'Amount must be greater than zero',
        );
      }

      const amountInWithFee =
        amountIn *
        (BPS - ASSUMED_FEE_BPS);

      const estimatedAmountOut =
        (amountInWithFee * reserveOut) /
        (
          reserveIn * BPS +
          amountInWithFee
        );

      const minimumAmountOut =
        estimatedAmountOut *
        (BPS - SLIPPAGE_BPS) /
        BPS;

      if (
        estimatedAmountOut <= 0n ||
        minimumAmountOut <= 0n
      ) {
        throw new BadRequestException(
          'Swap output is too small',
        );
      }

      return {
        network: 'TESTNET',
        protocol: 'SOROSWAP',
        quoteType: 'INDICATIVE',

        pool: POOL,
        router: ROUTER,

        assetIn: dto.assetIn,
        assetOut: dto.assetOut,

        amountIn:
          amountIn.toString(),

        estimatedAmountOut:
          estimatedAmountOut.toString(),

        minimumAmountOut:
          minimumAmountOut.toString(),

        amountInFormatted:
          this.formatUnits(
            amountIn,
            decimalsIn,
          ),

        estimatedAmountOutFormatted:
          this.formatUnits(
            estimatedAmountOut,
            decimalsOut,
          ),

        minimumAmountOutFormatted:
          this.formatUnits(
            minimumAmountOut,
            decimalsOut,
          ),

        decimalsIn,
        decimalsOut,

        assumedFeeBps:
          Number(ASSUMED_FEE_BPS),

        slippageBps:
          Number(SLIPPAGE_BPS),
      };
    } catch (error) {
      this.handleError(
        error,
        'Failed to get Soroswap quote',
      );
    }
  }

  async prepareSwap(
    dto: SoroswapQuoteDto,
    walletAddress: string,
  ) {
    try {
      this.validateWallet(
        walletAddress,
      );

      const quote =
        await this.quote(dto);

      const amountIn =
        BigInt(quote.amountIn);

      const minimumAmountOut =
        BigInt(
          quote.minimumAmountOut,
        );

      const balanceRaw =
        await this.readContract(
          dto.assetIn,
          'balance',
          {
            id: walletAddress,
          },
        );

      const balance =
        BigInt(String(balanceRaw));

      if (balance < amountIn) {
        throw new BadRequestException({
          message:
            'Insufficient token balance',

          asset: dto.assetIn,

          required:
            amountIn.toString(),

          available:
            balance.toString(),

          requiredFormatted:
            quote.amountInFormatted,

          availableFormatted:
            this.formatUnits(
              balance,
              quote.decimalsIn,
            ),
        });
      }

      const account =
        await this.horizon.loadAccount(
          walletAddress,
        );

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) +
          300,
      );

      const router =
        new Contract(ROUTER);

      const operation = router.call(
        'swap_exact_tokens_for_tokens',

        nativeToScVal(
          amountIn,
          { type: 'i128' },
        ),

        nativeToScVal(
          minimumAmountOut,
          { type: 'i128' },
        ),

        nativeToScVal(
          [
            new Address(dto.assetIn),
            new Address(dto.assetOut),
          ],
          { type: 'vec' },
        ),

        new Address(
          walletAddress,
        ).toScVal(),

        nativeToScVal(
          deadline,
          { type: 'u64' },
        ),
      );

      const tx = new TransactionBuilder(
        account,
        {
          fee: BASE_FEE,
          networkPassphrase: NETWORK,
        },
      )
        .addOperation(operation)
        .setTimeout(300)
        .build();

      const simulation =
        await this.server.simulateTransaction(
          tx,
        );

      if (
        rpc.Api.isSimulationError(
          simulation,
        )
      ) {
        throw new BadRequestException({
          message:
            'Swap simulation failed',

          details:
            simulation.error,
        });
      }

      if (
        !rpc.Api.isSimulationSuccess(
          simulation,
        ) ||
        !simulation.result
      ) {
        throw new BadRequestException(
          'Swap simulation returned no result',
        );
      }

      const simulationResult =
        simulation.result;

      const amountsRaw =
        scValToNative(
          simulationResult.retval,
        );

      if (
        !Array.isArray(amountsRaw) ||
        amountsRaw.length < 2
      ) {
        throw new BadRequestException(
          'Unexpected Router simulation result',
        );
      }

      const simulatedAmountOut =
        BigInt(
          String(
            amountsRaw[
              amountsRaw.length - 1
            ],
          ),
        );

      if (
        simulatedAmountOut <
        minimumAmountOut
      ) {
        throw new BadRequestException({
          message:
            'Simulated output is below minimum output',

          minimumAmountOut:
            minimumAmountOut.toString(),

          simulatedAmountOut:
            simulatedAmountOut.toString(),
        });
      }

      for (
        const entry of
        simulationResult.auth ?? []
      ) {
        const credentialType =
          entry
            .credentials()
            .switch()
            .name;

        if (
          credentialType !==
          'sorobanCredentialsSourceAccount'
        ) {
          throw new BadRequestException({
            message:
              'Additional Soroban authorization is required',

            credentialType,
          });
        }
      }

      const prepared =
        rpc.assembleTransaction(
          tx,
          simulation,
        ).build();

      const transactionHash =
        prepared
          .hash()
          .toString('hex');

      const expiresAt =
        Date.now() + SWAP_EXPIRY_MS;

      this.pendingSwaps.set(
        transactionHash,
        {
          walletAddress,
          expiresAt,
        },
      );

      return {
        success: true,

        network: 'TESTNET',

        from: walletAddress,
        to: walletAddress,

        router: ROUTER,
        pool: POOL,

        quote,

        simulatedAmountOut:
          simulatedAmountOut.toString(),

        simulatedAmountOutFormatted:
          this.formatUnits(
            simulatedAmountOut,
            quote.decimalsOut,
          ),

        minResourceFee:
          simulation.minResourceFee,

        transactionHash,

        // Unsigned, prepared XDR.
        // Sign this with Freighter.
        xdr: prepared.toXDR(),

        expiresAt:
          new Date(
            expiresAt,
          ).toISOString(),
      };
    } catch (error) {
      this.handleError(
        error,
        'Failed to prepare Soroswap swap',
      );
    }
  }

  async broadcast(
    dto: BroadcastSoroswapDto,
    walletAddress: string,
  ) {
    try {
      this.validateWallet(
        walletAddress,
      );

      const transaction =
        TransactionBuilder.fromXDR(
          dto.signedXdr,
          NETWORK,
        );


      if (
        transaction instanceof
        FeeBumpTransaction
      ) {
        throw new BadRequestException(
          'Fee-bump transactions are not supported',
        );
      }

      if (
        transaction.source !==
        walletAddress
      ) {
        throw new BadRequestException(
          'Transaction source does not match verified wallet',
        );
      }

      if (
        transaction.signatures.length === 0
      ) {
        throw new BadRequestException(
          'Transaction is not signed',
        );
      }

      const hash =
        transaction
          .hash()
          .toString('hex');

      const pending =
        this.pendingSwaps.get(hash);

      if (!pending) {
        throw new BadRequestException(
          'Unknown prepared swap transaction',
        );
      }

      if (
        pending.walletAddress !==
        walletAddress
      ) {
        throw new BadRequestException(
          'Prepared swap belongs to another wallet',
        );
      }

      if (
        pending.expiresAt <
        Date.now()
      ) {
        this.pendingSwaps.delete(hash);

        throw new BadRequestException(
          'Prepared swap has expired',
        );
      }

      const submitted =
        await this.server.sendTransaction(
          transaction,
        );

      if (
        submitted.status === 'ERROR'
      ) {
        throw new BadRequestException({
          message:
            'Stellar RPC rejected the transaction',

          hash: submitted.hash,

          details:
            submitted.errorResult
              ? submitted.errorResult.toXDR(
                  'base64',
                )
              : null,
        });
      }

      this.pendingSwaps.delete(hash);

      for (
        let attempt = 0;
        attempt < 30;
        attempt++
      ) {
        const result =
          await this.server.getTransaction(
            submitted.hash,
          );

        if (
          result.status === 'SUCCESS'
        ) {
          return {
            success: true,

            pending: false,

            network: 'TESTNET',

            hash: submitted.hash,

            status: result.status,

            ledger: result.ledger,
          };
        }

        if (
          result.status === 'FAILED'
        ) {
          throw new BadRequestException({
            message:
              'Swap transaction failed on-chain',

            hash: submitted.hash,

            status: result.status,

            ledger: result.ledger,
          });
        }

        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              2000,
            ),
        );
      }

      return {
        success: false,

        pending: true,

        network: 'TESTNET',

        hash: submitted.hash,

        status: 'PENDING',

        message:
          'Transaction submitted but confirmation is still pending',
      };
    } catch (error) {
      this.handleError(
        error,
        'Failed to broadcast Soroswap transaction',
      );
    }
  }

  async getTransactionStatus(
    hash: string,
  ) {
    try {
      if (
        !/^[a-fA-F0-9]{64}$/.test(
          hash,
        )
      ) {
        throw new BadRequestException(
          'Invalid transaction hash',
        );
      }

      const result =
        await this.server.getTransaction(
          hash,
        );

      if (
        result.status === 'NOT_FOUND'
      ) {
        return {
          hash,
          status: 'NOT_FOUND',
          success: false,
          pending: true,
          ledger: null,
        };
      }

      return {
        hash,

        status: result.status,

        success:
          result.status === 'SUCCESS',

        pending: false,

        ledger: result.ledger,
      };
    } catch (error) {
      this.handleError(
        error,
        'Failed to get transaction status',
      );
    }
  }

  private handleError(
    error: unknown,
    fallbackMessage: string,
  ): never {
    if (
      error instanceof HttpException
    ) {
      throw error;
    }

    const details =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);

    this.logger.error(
      `${fallbackMessage}: ${details}`,
    );

    throw new InternalServerErrorException({
      message: fallbackMessage,
      details,
    });
  }
}
