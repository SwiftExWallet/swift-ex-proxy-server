import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { formatUnits, getAddress } from 'ethers';
import * as StellarSdk from '@stellar/stellar-sdk';
import { calculateReverseBridgeQuote } from './bridge-fee';
import { CircleService } from './circle/circle.service';
import { ExpectedBurn, validateBurnMessage } from './circle/cctp-message';
import { CreateBridgeDto } from './dto/create-bridge.dto';
import { EvmService } from './evm/evm.service';
import { BridgeRepository } from './repositories/bridge.repository';
import { StellarService } from './stellar/stellar.service';
import { BridgeDirection } from './types/bridge-direction.type';
import { EvmSourceChain } from './evm/evm-source-chain';
import { BridgeStatus } from './types/bridge-status.type';
import { BridgeTransfer } from './types/bridge-transfer.type';

@Injectable()
export class StellarToEvmService {
  private readonly logger = new Logger(StellarToEvmService.name);

  constructor(
    private readonly repository: BridgeRepository,
    private readonly stellar: StellarService,
    private readonly evm: EvmService,
    private readonly circle: CircleService,
  ) {}

  async quote(dto: CreateBridgeDto) {
    if (dto.fast) {
      throw new BadRequestException(
        'Stellar source supports standard finality only.',
      );
    }
    this.stellar.validateAddress(dto.stellarAddress);
    const evmAddress = getAddress(dto.evmAddress);
    const amount = this.parseAmount(dto.amount);
    const [balance, feeBps, circleMinimumFee] = await Promise.all([
      this.stellar.balanceRaw(dto.stellarAddress),
      this.evm.feeBps(EvmSourceChain.SEPOLIA),
      this.circle.getStellarBurnFee(),
    ]);
    if (balance < amount * 10n)
      throw new BadRequestException('Insufficient USDC balance.');
    const calculated = calculateReverseBridgeQuote(
      amount,
      feeBps,
      circleMinimumFee,
    );
    return {
      direction: BridgeDirection.STELLAR_TO_EVM,
      evmAddress,
      stellarAddress: dto.stellarAddress,
      amount: dto.amount,
      amountRaw: amount.toString(),
      fast: false,
      finalityThreshold: 2000,
      feeBps: feeBps.toString(),
      protocolFee: formatUnits(calculated.protocolFee, 6),
      protocolFeeRaw: calculated.protocolFee.toString(),
      netAmount: formatUnits(calculated.netAmount, 6),
      netAmountRaw: calculated.netAmount.toString(),
      maxFee: formatUnits(calculated.maxFee, 6),
      maxFeeRaw: calculated.maxFee.toString(),
      minimumReceived: formatUnits(calculated.minimumReceived, 6),
      minimumReceivedRaw: calculated.minimumReceived.toString(),
      expiresAt: Date.now() + 60_000,
    };
  }

  async create(dto: CreateBridgeDto): Promise<BridgeTransfer> {
    if (!dto.idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for Stellar source transfers.',
      );
    }
    const existing = await this.repository.findByIdempotencyKey(
      dto.idempotencyKey,
      dto.stellarAddress,
    );
    if (existing) return this.reuseIdempotent(existing, dto);
    const quote = await this.quote(dto);
    const xdr = await this.stellar.buildApprovalTransaction(
      quote.stellarAddress,
      BigInt(quote.netAmountRaw),
    );
    try {
      const transfer = await this.repository.create({
        direction: BridgeDirection.STELLAR_TO_EVM,
        idempotencyKey: dto.idempotencyKey,
        evmAddress: quote.evmAddress,
        stellarAddress: quote.stellarAddress,
        amount: quote.amount,
        amountRaw: quote.amountRaw,
        fast: false,
        feeBps: quote.feeBps,
        protocolFeeRaw: quote.protocolFeeRaw,
        netAmountRaw: quote.netAmountRaw,
        maxFee: quote.maxFeeRaw,
        minimumReceived: quote.minimumReceived,
        status: BridgeStatus.APPROVAL_SIGNATURE_REQUIRED,
        stellarUnsignedXdr: xdr,
        sourceDomain: 27,
        destinationDomain: this.circle.sourceDomain,
        sourceTokenMessenger: this.stellar.tokenMessengerAddress,
        destinationTokenMessenger: this.evm.tokenMessengerAddress,
        sourceMessageTransmitter: this.stellar.messageTransmitterAddress,
        destinationMessageTransmitter: this.evm.messageTransmitterAddress,
        sourceUsdcAddress: this.stellar.usdcContractAddress,
        destinationUsdcAddress: this.evm.usdcAddress,
        activeStellarKey: quote.stellarAddress,
      });
      return this.withApprovalSigningRequest(transfer);
    } catch (error: any) {
      if (error?.code === 11000) {
        const duplicate = await this.repository.findByIdempotencyKey(
          dto.idempotencyKey,
          dto.stellarAddress,
        );
        if (duplicate) return this.reuseIdempotent(duplicate, dto);
        throw new ConflictException(
          'The Stellar wallet already has an active bridge transfer.',
        );
      }
      throw error;
    }
  }

  async submitStellarSignature(
    id: string,
    signedXdr: string,
  ): Promise<BridgeTransfer> {
    return this.withLease(id, async (transfer, owner) => {
      if (
        ![
          BridgeStatus.APPROVAL_SIGNATURE_REQUIRED,
          BridgeStatus.BURN_SIGNATURE_REQUIRED,
        ].includes(transfer.status) ||
        !transfer.stellarUnsignedXdr
      ) {
        throw new BadRequestException(
          `Transfer is not waiting for a Stellar signature. Current status: ${transfer.status}`,
        );
      }
      const transaction = this.stellar.verifySignedXdr(
        transfer.stellarUnsignedXdr,
        signedXdr,
        transfer.stellarAddress,
      );
      const sourceTxHash = Buffer.from(transaction.hash()).toString('hex');
      if (transfer.status === BridgeStatus.APPROVAL_SIGNATURE_REQUIRED) {
        const submitted = await this.stellar.submitSignedXdr(
          transfer.stellarUnsignedXdr,
          signedXdr,
          transfer.stellarAddress,
        );
        const pending = await this.repository.updateLeased(id, owner, {
          status: BridgeStatus.APPROVAL_PENDING,
          approvalTxHash: submitted.hash,
          signedStellarXdr: signedXdr,
          error: null,
        });
        return this.publicTransfer(pending);
      }
      const pending = await this.repository.updateLeased(id, owner, {
        status: BridgeStatus.SOURCE_PENDING,
        sourceTxHash,
        signedStellarXdr: signedXdr,
        error: null,
      });
      const response = await this.stellar.broadcast(signedXdr);
      if (response.status === 'ERROR') {
        return this.fail(id, owner, 'Stellar burn transaction was rejected.');
      }
      return this.publicTransfer(pending);
    });
  }

  async submitEvmSignature(
    id: string,
    signedTx: string,
  ): Promise<BridgeTransfer> {
    return this.withLease(id, async (transfer, owner) => {
      if (
        transfer.status !== BridgeStatus.MINT_SIGNATURE_REQUIRED ||
        !transfer.message ||
        !transfer.attestation ||
        !transfer.evmUnsignedTx ||
        !transfer.messageNonce
      ) {
        throw new BadRequestException(
          `Transfer is not waiting for an EVM mint signature. Current status: ${transfer.status}`,
        );
      }
      if (await this.evm.isMessageReceived(transfer.messageNonce)) {
        return this.complete(id, owner);
      }
      const transaction = this.evm.verifyMint(
        signedTx,
        transfer.evmAddress,
        transfer.message,
        transfer.attestation,
        transfer.evmUnsignedTx,
      );
      if (!transaction.hash)
        throw new BadRequestException('Signed transaction hash unavailable.');
      await this.repository.updateLeased(id, owner, {
        status: BridgeStatus.DESTINATION_PENDING,
        destinationTxHash: transaction.hash,
        signedEvmTx: signedTx,
        error: null,
      });
      const receipt = await this.evm.broadcast(
        EvmSourceChain.SEPOLIA,
        signedTx,
      );
      if (receipt?.status === 1) return this.complete(id, owner, receipt.hash);
      return this.retryMint(
        id,
        owner,
        'Destination mint transaction reverted.',
      );
    });
  }

  async submitSourceTx(id: string, txHash: string): Promise<BridgeTransfer> {
    const hash = txHash.trim().replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new BadRequestException('Invalid Stellar transaction hash.');
    }
    const transfer = await this.repository.findById(id);
    if (!transfer) throw new BadRequestException('Bridge transfer not found.');
    if (
      ![BridgeStatus.BURN_SIGNATURE_REQUIRED, BridgeStatus.SOURCE_PENDING,
      BridgeStatus.ATTESTATION_PENDING].includes(transfer.status)
    ) {
      throw new BadRequestException(
        `Transfer cannot resume from a source transaction in status: ${transfer.status}`,
      );
    }
    const result = await this.stellar.getTransaction(hash);
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND) {
      throw new BadRequestException('Source transaction was not found.');
    }
    if (result.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException('Source transaction did not succeed.');
    }
    const event = this.stellar.verifyBurnEvents(result, this.expectedBurn(transfer));
    return this.publicTransfer(
      await this.repository.update(id, {
        sourceTxHash: hash,
        message: event.message,
        status: BridgeStatus.ATTESTATION_PENDING,
        error: null,
      }),
    );
  }

  async status(id: string): Promise<BridgeTransfer> {
    const current = await this.repository.get(id);
    this.logger.log(`Bridge status request id=${id} status=${current.status}`);
    if (
      [BridgeStatus.COMPLETED, BridgeStatus.FAILED].includes(current.status)
    ) {
      return this.publicTransfer(current);
    }
    if (
      [
        BridgeStatus.APPROVAL_SIGNATURE_REQUIRED,
        BridgeStatus.BURN_SIGNATURE_REQUIRED,
        BridgeStatus.MINT_SIGNATURE_REQUIRED,
      ].includes(current.status)
    ) {
      return this.signingTransfer(current);
    }
    return this.withLease(id, (transfer, owner) =>
      this.advance(transfer, owner),
    );
  }

  @Cron('*/30 * * * * *', { name: 'stellar-to-evm-bridge-recovery' })
  async recover(): Promise<void> {
    for (const transfer of await this.repository.findRecoverable()) {
      try {
        await this.status(transfer.id);
      } catch (error: any) {
        this.logger.warn(`Recovery ${transfer.id}: ${error?.message ?? error}`);
      }
    }
  }

  private async advance(
    transfer: BridgeTransfer,
    owner: string,
  ): Promise<BridgeTransfer> {
    if (transfer.status === BridgeStatus.APPROVAL_PENDING)
      return this.checkApproval(transfer, owner);
    if (transfer.status === BridgeStatus.SOURCE_PENDING)
      return this.checkBurn(transfer, owner);
    if (transfer.status === BridgeStatus.ATTESTATION_PENDING)
      return this.checkAttestation(transfer, owner);
    if (transfer.status === BridgeStatus.DESTINATION_PENDING)
      return this.checkMint(transfer, owner);
    return this.publicTransfer(transfer);
  }

  private async checkApproval(
    transfer: BridgeTransfer,
    owner: string,
  ): Promise<BridgeTransfer> {
    this.logger.log(
      `Checking Stellar approval transfer=${transfer.id} hash=${transfer.approvalTxHash ?? 'missing'}`,
    );
    if (!transfer.approvalTxHash) return this.publicTransfer(transfer);
    const result = await this.stellar.getTransaction(transfer.approvalTxHash);
    this.logger.log(
      `Stellar approval transfer=${transfer.id} rpcStatus=${result.status}`,
    );
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND) {
      if (transfer.signedStellarXdr) {
        try {
          await this.stellar.broadcast(transfer.signedStellarXdr);
          this.logger.log(
            `Rebroadcast Stellar approval transfer=${transfer.id}`,
          );
        } catch (error: any) {
          this.logger.warn(
            `Approval rebroadcast ${transfer.id}: ${error?.message ?? error}`,
          );
        }
      }
      return this.publicTransfer(transfer);
    }
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED)
      return this.fail(transfer.id, owner, 'Stellar USDC approval failed.');
    const xdr = await this.stellar.buildBurnTransaction(
      transfer.stellarAddress,
      transfer.evmAddress,
      BigInt(transfer.netAmountRaw ?? transfer.amountRaw),
      BigInt(transfer.protocolFeeRaw ?? 0),
      BigInt(transfer.maxFee),
      this.circle.sourceDomain,
    );
    const updated = await this.repository.updateLeased(transfer.id, owner, {
      status: BridgeStatus.BURN_SIGNATURE_REQUIRED,
      stellarUnsignedXdr: xdr,
      signedStellarXdr: null,
    });
    return this.withBurnSigningRequest(updated);
  }

  private async checkBurn(
    transfer: BridgeTransfer,
    owner: string,
  ): Promise<BridgeTransfer> {
    if (!transfer.sourceTxHash)
      throw new ConflictException('Stellar burn hash is missing.');
    let result = await this.stellar.getTransaction(transfer.sourceTxHash);
    if (
      result.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND &&
      transfer.signedStellarXdr
    ) {
      await this.stellar.broadcast(transfer.signedStellarXdr);
      result = await this.stellar.getTransaction(transfer.sourceTxHash);
    }
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND)
      return this.publicTransfer(transfer);
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
      return this.fail(transfer.id, owner, 'Stellar burn transaction failed.');
    }
    const event = this.stellar.verifyBurnEvents(
      result,
      this.expectedBurn(transfer),
    );
    return this.publicTransfer(
      await this.repository.updateLeased(transfer.id, owner, {
        status: BridgeStatus.ATTESTATION_PENDING,
        message: event.message,
        signedStellarXdr: null,
        stellarUnsignedXdr: null,
      }),
    );
  }

  private async checkAttestation(
    transfer: BridgeTransfer,
    owner: string,
  ): Promise<BridgeTransfer> {
    if (!transfer.sourceTxHash)
      throw new ConflictException('Stellar burn hash is missing.');
    const attestation = await this.circle.getStellarAttestation(
      transfer.sourceTxHash,
    );
    if (!attestation) return this.publicTransfer(transfer);
    const decoded = validateBurnMessage(
      attestation.message,
      this.expectedBurn(transfer),
    );
    const checkpoint = await this.repository.updateLeased(transfer.id, owner, {
      message: attestation.message,
      attestation: attestation.attestation,
      messageNonce: decoded.nonce,
      error: null,
    });
    const rawTx = await this.evm.prepareMint(
      checkpoint.evmAddress,
      attestation.message,
      attestation.attestation,
      decoded.nonce,
    );
    if (!rawTx) return this.complete(transfer.id, owner);
    const pending = await this.repository.updateLeased(transfer.id, owner, {
      status: BridgeStatus.MINT_SIGNATURE_REQUIRED,
      evmUnsignedTx: rawTx,
    });
    return this.withMintSigningRequest(pending);
  }

  private async checkMint(
    transfer: BridgeTransfer,
    owner: string,
  ): Promise<BridgeTransfer> {
    if (!transfer.messageNonce)
      throw new ConflictException('CCTP nonce is missing.');
    if (await this.evm.isMessageReceived(transfer.messageNonce)) {
      return this.complete(
        transfer.id,
        owner,
        transfer.destinationTxHash ?? undefined,
      );
    }
    if (!transfer.destinationTxHash)
      throw new ConflictException('Destination transaction hash is missing.');
    let receipt = await this.evm.receipt(
      EvmSourceChain.SEPOLIA,
      transfer.destinationTxHash,
    );
    if (!receipt && transfer.signedEvmTx)
      receipt = await this.evm.broadcast(
        EvmSourceChain.SEPOLIA,
        transfer.signedEvmTx,
      );
    if (!receipt) return this.publicTransfer(transfer);
    if (
      receipt.status === 1 &&
      (await this.evm.isMessageReceived(transfer.messageNonce))
    ) {
      return this.complete(transfer.id, owner, receipt.hash);
    }
    if (receipt.status === 0)
      return this.retryMint(
        transfer.id,
        owner,
        'Destination mint transaction reverted.',
      );
    return this.publicTransfer(transfer);
  }

  private expectedBurn(transfer: BridgeTransfer): ExpectedBurn {
    if (
      transfer.destinationDomain == null ||
      !transfer.sourceTokenMessenger ||
      !transfer.destinationTokenMessenger ||
      !transfer.sourceUsdcAddress ||
      !transfer.netAmountRaw
    ) {
      throw new ConflictException('Persisted CCTP route is incomplete.');
    }
    return {
      destinationDomain: transfer.destinationDomain,
      sender: this.stellarBytes32(transfer.sourceTokenMessenger, true),
      recipient: this.evmBytes32(transfer.destinationTokenMessenger),
      burnToken: this.stellarBytes32(transfer.sourceUsdcAddress, true),
      mintRecipient: this.evmBytes32(transfer.evmAddress),
      messageSender: this.stellarBytes32(transfer.stellarAddress, false),
      amount: BigInt(transfer.netAmountRaw),
      maxFee: BigInt(transfer.maxFee),
    };
  }

  private stellarBytes32(address: string, contract: boolean): string {
    const bytes = contract
      ? StellarSdk.StrKey.decodeContract(address)
      : StellarSdk.StrKey.decodeEd25519PublicKey(address);
    return `0x${Buffer.from(bytes).toString('hex')}`;
  }

  private evmBytes32(address: string): string {
    return `0x${'00'.repeat(12)}${getAddress(address).slice(2).toLowerCase()}`;
  }

  private parseAmount(value: string): bigint {
    if (!/^\d+(\.\d{1,6})?$/.test(value))
      throw new BadRequestException('Invalid USDC amount.');
    const [whole, fraction = ''] = value.split('.');
    const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
    if (amount <= 0n)
      throw new BadRequestException('Amount must be greater than zero.');
    return amount;
  }

  private reuseIdempotent(
    transfer: BridgeTransfer,
    dto: CreateBridgeDto,
  ): BridgeTransfer {
    if (
      transfer.direction !== BridgeDirection.STELLAR_TO_EVM ||
      transfer.stellarAddress !== dto.stellarAddress ||
      transfer.evmAddress !== getAddress(dto.evmAddress) ||
      BigInt(transfer.amountRaw) !== this.parseAmount(dto.amount) ||
      dto.fast
    ) {
      throw new ConflictException(
        'idempotencyKey was already used for a different bridge request.',
      );
    }
    return this.signingTransfer(transfer);
  }

  private async complete(
    id: string,
    owner: string,
    hash?: string,
  ): Promise<BridgeTransfer> {
    return this.publicTransfer(
      await this.repository.updateLeased(id, owner, {
        status: BridgeStatus.COMPLETED,
        destinationTxHash: hash,
        activeStellarKey: null,
        signedEvmTx: null,
        evmUnsignedTx: null,
        error: null,
      }),
    );
  }

  private async fail(
    id: string,
    owner: string,
    error: string,
  ): Promise<BridgeTransfer> {
    return this.publicTransfer(
      await this.repository.updateLeased(id, owner, {
        status: BridgeStatus.FAILED,
        activeStellarKey: null,
        error,
      }),
    );
  }

  private async retryMint(
    id: string,
    owner: string,
    error: string,
  ): Promise<BridgeTransfer> {
    return this.publicTransfer(
      await this.repository.updateLeased(id, owner, {
        status: BridgeStatus.ATTESTATION_PENDING,
        destinationTxHash: null,
        signedEvmTx: null,
        evmUnsignedTx: null,
        error,
      }),
    );
  }

  private async withLease(
    id: string,
    work: (transfer: BridgeTransfer, owner: string) => Promise<BridgeTransfer>,
  ): Promise<BridgeTransfer> {
    const owner = randomUUID();
    const transfer = await this.repository.acquireLease(id, owner);
    if (!transfer) return this.publicTransfer(await this.repository.get(id));
    try {
      return await work(transfer, owner);
    } finally {
      await this.repository.releaseLease(id, owner);
    }
  }

  private signingTransfer(transfer: BridgeTransfer): BridgeTransfer {
    if (transfer.status === BridgeStatus.APPROVAL_SIGNATURE_REQUIRED)
      return this.withApprovalSigningRequest(transfer);
    if (transfer.status === BridgeStatus.BURN_SIGNATURE_REQUIRED)
      return this.withBurnSigningRequest(transfer);
    if (transfer.status === BridgeStatus.MINT_SIGNATURE_REQUIRED)
      return this.withMintSigningRequest(transfer);
    return this.publicTransfer(transfer);
  }

  private withApprovalSigningRequest(transfer: BridgeTransfer): BridgeTransfer {
    if (!transfer.stellarUnsignedXdr) return this.publicTransfer(transfer);
    return {
      ...this.publicTransfer(transfer),
      signingRequest: {
        type: 'STELLAR',
        purpose: 'APPROVAL',
        xdr: transfer.stellarUnsignedXdr,
      },
    };
  }

  private withBurnSigningRequest(transfer: BridgeTransfer): BridgeTransfer {
    if (!transfer.stellarUnsignedXdr) return this.publicTransfer(transfer);
    return {
      ...this.publicTransfer(transfer),
      signingRequest: {
        type: 'STELLAR',
        purpose: 'BURN',
        xdr: transfer.stellarUnsignedXdr,
      },
    };
  }

  private withMintSigningRequest(transfer: BridgeTransfer): BridgeTransfer {
    if (!transfer.evmUnsignedTx) return this.publicTransfer(transfer);
    return {
      ...this.publicTransfer(transfer),
      signingRequest: {
        type: 'EVM',
        purpose: 'MINT',
        rawTx: transfer.evmUnsignedTx,
      },
    };
  }

  private publicTransfer(transfer: BridgeTransfer): BridgeTransfer {
    const result = { ...transfer } as any;
    delete result.signedStellarXdr;
    delete result.signedEvmTx;
    delete result.leaseOwner;
    delete result.leaseExpiresAt;
    delete result.activeStellarKey;
    delete result.evmUnsignedTx;
    return result;
  }
}
