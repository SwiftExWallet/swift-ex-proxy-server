import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  Transaction,
  TransactionLike,
  FetchRequest,
} from 'ethers';

import {
  ROUTER_ABI,
  TOKEN_ABI,
  MESSAGE_TRANSMITTER_V2_ABI,
} from './evm.constants';
import {
  EvmSourceChain,
  EvmSourceChainConfig,
  resolveEvmSourceChain,
} from './evm-source-chain';

interface EvmContext {
  config: EvmSourceChainConfig;
  provider: JsonRpcProvider;
  token: Contract;
  router: Contract;
  transmitter: Contract;
}

@Injectable()
export class EvmService {
  private readonly contexts = new Map<EvmSourceChain, EvmContext>();
  readonly tokenInterface = new Interface(TOKEN_ABI);
  readonly routerInterface = new Interface(ROUTER_ABI);
  readonly transmitterInterface = new Interface(MESSAGE_TRANSMITTER_V2_ABI);

  constructor(private readonly config: ConfigService) {}

  get chainId(): bigint {
    return BigInt(this.sepolia.config.chainId);
  }
  get usdcAddress(): string {
    return getAddress(this.sepolia.config.usdcAddress);
  }
  get routerAddress(): string {
    return getAddress(this.sepolia.config.routerAddress);
  }
  get tokenMessengerAddress(): string {
    return getAddress(this.sepolia.config.tokenMessengerAddress);
  }
  get messageTransmitterAddress(): string {
    return getAddress(this.sepolia.config.messageTransmitterAddress);
  }

  private get sepolia(): EvmContext {
    return this.getContext(EvmSourceChain.SEPOLIA);
  }

  private getContext(sourceChain: EvmSourceChain): EvmContext {
    const existing = this.contexts.get(sourceChain);
    if (existing) return existing;
    const source = resolveEvmSourceChain(this.config, sourceChain);
    if (!source.rpcUrl) {
      throw new ServiceUnavailableException(
        `Bridge RPC is not configured for ${sourceChain}`,
      );
    }
    const request = new FetchRequest(source.rpcUrl);
    request.timeout = 15000;
    const provider = new JsonRpcProvider(request);
    const context: EvmContext = {
      config: source,
      provider,
      token: new Contract(source.usdcAddress, TOKEN_ABI, provider),
      router: new Contract(source.routerAddress, ROUTER_ABI, provider),
      transmitter: new Contract(
        source.messageTransmitterAddress,
        MESSAGE_TRANSMITTER_V2_ABI,
        provider,
      ),
    };
    this.contexts.set(sourceChain, context);
    return context;
  }

  prepareApproval(sourceChain: EvmSourceChain, from: string, amount: bigint) {
    const source = resolveEvmSourceChain(this.config, sourceChain);
    return this.buildTransaction(
      sourceChain,
      from,
      source.usdcAddress,
      this.tokenInterface.encodeFunctionData('approve', [
        source.routerAddress,
        amount,
      ]),
    );
  }

  prepareBridge(
    sourceChain: EvmSourceChain,
    from: string,
    amount: bigint,
    forwarder: string,
    hook: string,
    maxFee: bigint,
    finalityThreshold: number,
    userMaxFeeBps: number,
  ) {
    const source = resolveEvmSourceChain(this.config, sourceChain);
    return this.buildTransaction(
      sourceChain,
      from,
      source.routerAddress,
      this.routerInterface.encodeFunctionData('bridgeToStellar', [
        amount,
        forwarder,
        hook,
        maxFee,
        finalityThreshold,
        userMaxFeeBps,
      ]),
    );
  }

  private verify(
    sourceChain: EvmSourceChain,
    signedTx: string,
    from: string,
    to: string,
    data: string,
  ): Transaction {
    try {
      const source = resolveEvmSourceChain(this.config, sourceChain);
      const tx = Transaction.from(signedTx);
      if (
        !tx.isSigned() ||
        tx.from !== getAddress(from) ||
        tx.chainId !== BigInt(source.chainId) ||
        tx.to !== getAddress(to) ||
        tx.value !== 0n ||
        tx.data.toLowerCase() !== data.toLowerCase() ||
        (tx.type !== 0 && tx.type !== 2)
      ) {
        throw new Error('mismatch');
      }
      return tx;
    } catch {
      throw new BadRequestException(
        'Signed EVM transaction does not match the bridge request',
      );
    }
  }

  verifyPrepared(tx: Transaction, prepared: TransactionLike) {
    if (
      tx.unsignedSerialized !== Transaction.from(prepared).unsignedSerialized
    ) {
      throw new BadRequestException(
        'Signed EVM transaction differs from the prepared transaction',
      );
    }
  }

  verifyApproval(
    sourceChain: EvmSourceChain,
    signedTx: string,
    from: string,
    amount: bigint,
  ) {
    const source = resolveEvmSourceChain(this.config, sourceChain);
    return this.verify(
      sourceChain,
      signedTx,
      from,
      source.usdcAddress,
      this.tokenInterface.encodeFunctionData('approve', [
        source.routerAddress,
        amount,
      ]),
    );
  }

  verifyBridge(
    sourceChain: EvmSourceChain,
    signedTx: string,
    from: string,
    expected: {
      amount: bigint;
      forwarder: string;
      hook: string;
      maxFee: bigint;
      finalityThreshold: number;
      userMaxFeeBps: number;
    },
  ) {
    const source = resolveEvmSourceChain(this.config, sourceChain);
    return this.verify(
      sourceChain,
      signedTx,
      from,
      source.routerAddress,
      this.routerInterface.encodeFunctionData('bridgeToStellar', [
        expected.amount,
        expected.forwarder,
        expected.hook,
        expected.maxFee,
        expected.finalityThreshold,
        expected.userMaxFeeBps,
      ]),
    );
  }

  async isMessageReceived(nonce: string): Promise<boolean> {
    return BigInt(await this.sepolia.transmitter.usedNonces(nonce)) !== 0n;
  }

  async simulateMint(
    from: string,
    message: string,
    attestation: string,
  ): Promise<void> {
    const result = await this.sepolia.transmitter.receiveMessage.staticCall(
      message,
      attestation,
      {
        from: getAddress(from),
      },
    );
    if (result !== true)
      throw new BadRequestException('receiveMessage simulation returned false');
  }

  async prepareMint(
    from: string,
    message: string,
    attestation: string,
    nonce: string,
  ) {
    if (await this.isMessageReceived(nonce)) return null;
    await this.simulateMint(from, message, attestation);
    return this.buildTransaction(
      EvmSourceChain.SEPOLIA,
      from,
      this.messageTransmitterAddress,
      this.transmitterInterface.encodeFunctionData('receiveMessage', [
        message,
        attestation,
      ]),
    );
  }

  verifyMint(
    signedTx: string,
    from: string,
    message: string,
    attestation: string,
    prepared: {
      chainId: string;
      type: number;
      nonce: string;
      gasPrice: string;
      gasLimit: string;
      value: string;
      to: string;
      data: string;
    },
  ): Transaction {
    const tx = this.verify(
      EvmSourceChain.SEPOLIA,
      signedTx,
      from,
      this.messageTransmitterAddress,
      this.transmitterInterface.encodeFunctionData('receiveMessage', [
        message,
        attestation,
      ]),
    );
    this.verifyPrepared(tx, {
      ...prepared,
      nonce: Number(BigInt(prepared.nonce)),
    });
    return tx;
  }

  async broadcast(sourceChain: EvmSourceChain, signedTx: string) {
    const provider = this.getContext(sourceChain).provider;
    const tx = Transaction.from(signedTx);

    if (!tx.hash) {
      throw new BadRequestException('Signed transaction hash unavailable');
    }

    // Idempotency / retry check
    const existing = await provider.getTransactionReceipt(tx.hash);

    if (existing) {
      return existing;
    }

    try {
      const response = await provider.broadcastTransaction(signedTx);

      return await response.wait(1);
    } catch (error) {
      /*
       * RPC request may fail after transaction
       * was already accepted.
       */
      const receipt = await provider.getTransactionReceipt(tx.hash);

      if (receipt) {
        return receipt;
      }

      throw error;
    }
  }

  receipt(sourceChain: EvmSourceChain, hash: string) {
    return this.getContext(sourceChain).provider.getTransactionReceipt(hash);
  }

  async matchesBridgeTransaction(
    sourceChain: EvmSourceChain,
    hash: string,
    from: string,
    expected: {
      amount: bigint;
      forwarder: string;
      hook: string;
      maxFee: bigint;
      finalityThreshold: number;
      userMaxFeeBps: number;
    },
  ): Promise<boolean> {
    const source = resolveEvmSourceChain(this.config, sourceChain);
    const tx = await this.getContext(sourceChain).provider.getTransaction(hash);
    if (!tx || tx.from?.toLowerCase() !== getAddress(from).toLowerCase()) {
      return false;
    }
    if (!tx.to || tx.to.toLowerCase() !== source.routerAddress.toLowerCase()) {
      return false;
    }
    try {
      const parsed = this.routerInterface.parseTransaction({ data: tx.data });
      if (!parsed || parsed.name !== 'bridgeToStellar') return false;
      const args = parsed.args;
      return (
        BigInt(args[0]) === expected.amount &&
        String(args[1]).toLowerCase() === expected.forwarder.toLowerCase() &&
        String(args[2]).toLowerCase() === expected.hook.toLowerCase() &&
        BigInt(args[3]) === expected.maxFee &&
        Number(args[4]) === expected.finalityThreshold &&
        Number(args[5]) === expected.userMaxFeeBps
      );
    } catch {
      return false;
    }
  }

  onModuleDestroy() {
    for (const context of this.contexts.values()) context.provider.destroy();
    this.contexts.clear();
  }

  async feeBps(sourceChain: EvmSourceChain): Promise<bigint> {
    return BigInt(await this.getContext(sourceChain).router.feeBps());
  }

  async balance(sourceChain: EvmSourceChain, address: string): Promise<bigint> {
    return BigInt(
      await this.getContext(sourceChain).token.balanceOf(getAddress(address)),
    );
  }

  async allowance(
    sourceChain: EvmSourceChain,
    address: string,
  ): Promise<bigint> {
    const context = this.getContext(sourceChain);
    return BigInt(
      await context.token.allowance(
        getAddress(address),
        context.config.routerAddress,
      ),
    );
  }

  async buildTransaction(
    sourceChain: EvmSourceChain,
    from: string,
    to: string,
    data: string,
  ) {
    const context = this.getContext(sourceChain);
    const provider = context.provider;
    const sender = getAddress(from);

    const latestBlockPromise =
      typeof provider.getBlock === 'function'
        ? provider.getBlock('latest')
        : Promise.resolve(null);

    const [network, nonce, feeData, latestBlock, estimatedGas, balance] =
      await Promise.all([
        provider.getNetwork(),

        provider.getTransactionCount(sender, 'pending'),

        provider.getFeeData(),

        latestBlockPromise,

        provider.estimateGas({
          from: sender,
          to,
          data,
          value: 0n,
        }),

        provider.getBalance(sender),
      ]);

    if (network.chainId !== BigInt(context.config.chainId)) {
      throw new BadRequestException('Configured RPC has wrong chainId');
    }

    if (!feeData.gasPrice || feeData.gasPrice <= 0n) {
      throw new BadRequestException('Unable to get gas price');
    }

    const baseFeePerGas = latestBlock?.baseFeePerGas;
    const baseFeeFloor = baseFeePerGas
      ? baseFeePerGas + baseFeePerGas / 5n + 1n
      : 0n;
    const gasPrice =
      feeData.gasPrice > baseFeeFloor ? feeData.gasPrice : baseFeeFloor;

    if (!gasPrice || gasPrice <= 0n) {
      throw new BadRequestException('Unable to get gas price');
    }

    const gasLimit = (estimatedGas * 120n + 99n) / 100n;

    if (balance < gasLimit * gasPrice) {
      throw new BadRequestException('Insufficient native balance for gas');
    }

    return {
      chainId: `0x${context.config.chainId.toString(16)}`,
      type: 0,
      nonce: `0x${nonce.toString(16)}`,
      gasPrice: `0x${gasPrice.toString(16)}`,
      gasLimit: `0x${gasLimit.toString(16)}`,
      value: '0x0',
      to: getAddress(to),
      data,
    };
  }
}
