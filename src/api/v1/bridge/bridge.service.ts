import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { formatUnits, getAddress, parseUnits } from 'ethers';

import { BridgeQuoteDto } from './dto/bridge-quote.dto';
import { CreateBridgeDto } from './dto/create-bridge.dto';

import { BridgeRepository } from './repositories/bridge.repository';

import { BridgeStatus } from './types/bridge-status.type';
import {
  BridgeSigningRequest,
  BridgeTransfer,
} from './types/bridge-transfer.type';

import { EvmService } from './evm/evm.service';
import { StellarService } from './stellar/stellar.service';
import { CircleService } from './circle/circle.service';
import { StellarToEvmService } from './stellar-to-evm.service';
import { BridgeDirection } from './types/bridge-direction.type';
import { calculateBridgeQuote } from './bridge-fee';
import { Wallet, walletContainsAddress } from '../common/helpers/requestWallet';
import { rpc } from '@stellar/stellar-sdk';
import {
  EvmSourceChain,
  getEvmSourceChainDescriptor,
} from './evm/evm-source-chain';

@Injectable()
export class BridgeService {
  constructor(
    private readonly bridgeRepository: BridgeRepository,
    private readonly evm: EvmService,
    private readonly stellar: StellarService,
    private readonly circle: CircleService,
    private readonly stellarToEvm: StellarToEvmService,
  ) {}

  async assertAccess(id: string, wallet?: Wallet): Promise<void> {
    const transfer = await this.bridgeRepository.findById(id);
    if (!transfer) throw new NotFoundException('Bridge transfer not found.');

    if (!wallet) {
      return;
    }

    if (
      !walletContainsAddress(wallet, transfer.evmAddress) &&
      !walletContainsAddress(wallet, transfer.stellarAddress)
    ) {
      throw new ForbiddenException(
        'Bridge transfer does not belong to the verified wallet.',
      );
    }
  }

  private parseAmount(amount: string): bigint {
    if (!/^\d+(\.\d{1,6})?$/.test(amount)) {
      throw new BadRequestException(
        'Invalid USDC amount. Maximum 6 decimals allowed.',
      );
    }

    const rawAmount = parseUnits(amount, 6);

    if (rawAmount <= 0n) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    return rawAmount;
  }

  calculateQuote(
    amount: bigint,
    feeBps: bigint,
    circleMinimumFee: string,
    fast: boolean,
  ) {

    return calculateBridgeQuote(amount, feeBps, circleMinimumFee, fast);
  }

  async quote(dto: BridgeQuoteDto) {
    if (dto.direction === BridgeDirection.STELLAR_TO_EVM) {
      this.assertReverseSource(dto.sourceChain);
      return this.stellarToEvm.quote(dto);
    }
    const source = getEvmSourceChainDescriptor(dto.sourceChain);
    if (dto.fast && !source.supportsFastTransfer) {
      throw new BadRequestException(
        `${source.key} supports standard bridge finality only`,
      );
    }
    const evmAddress = getAddress(dto.evmAddress);

    this.stellar.validateAddress(dto.stellarAddress);

    const amount = this.parseAmount(dto.amount);

    const [balance, feeBps, hasTrustline] = await Promise.all([
      this.evm.balance(source.key, evmAddress),
      this.evm.feeBps(source.key),

      this.stellar.hasUsdcTrustline(dto.stellarAddress),
    ]);

    if (balance < amount) {
      throw new BadRequestException('Insufficient USDC balance.');
    }

    if (!hasTrustline) {
      throw new BadRequestException(
        'Stellar wallet does not have USDC trustline.',
      );
    }

    const finalityThreshold = dto.fast ? 1000 : 2000;

    const circleFee = await this.circle.getBurnFee(
      finalityThreshold,
      source.circleDomain,
    );

    if (!circleFee) {
      throw new BadRequestException('Circle fee unavailable.');
    }

    const calculated = this.calculateQuote(
      amount,
      feeBps,
      circleFee.minimumFee,
      dto.fast,
    );

    if (circleFee.forwardFee !== undefined) {
      const forwardingMaxFee = BigInt(circleFee.forwardFee);
      const minimumReceived =
        amount - calculated.protocolFee - forwardingMaxFee;

      if (minimumReceived <= 0n) {
        throw new BadRequestException(
          'Amount is too small to cover bridge forwarding fees.',
        );
      }

      calculated.maxFee = forwardingMaxFee;
      calculated.minimumReceived = minimumReceived;
    }

    if (
      source.key !== EvmSourceChain.SEPOLIA &&
      calculated.maxFee < calculated.protocolFee
    ) {
      calculated.maxFee = calculated.protocolFee;
      calculated.minimumReceived =
        amount - calculated.protocolFee - calculated.maxFee;
    }

    if (balance < amount + calculated.maxFee) {
      throw new BadRequestException(
        'Insufficient USDC balance for bridge fee.',
      );
    }

    return {
      sourceChain: source.key,

      sourceChainId: source.chainId,

      sourceDomain: source.circleDomain,

      sourceUsdcAddress: source.usdcAddress,

      sourceRouterAddress: source.routerAddress,

      sourceTokenMessenger: source.tokenMessengerAddress,

      sourceMessageTransmitter: source.messageTransmitterAddress,

      evmAddress,

      stellarAddress: dto.stellarAddress,

      amount: dto.amount,

      amountRaw: amount.toString(),

      fast: dto.fast,

      finalityThreshold,

      feeBps: feeBps.toString(),

      protocolFee: formatUnits(calculated.protocolFee, 6),

      protocolFeeRaw: calculated.protocolFee.toString(),

      maxFee: formatUnits(calculated.maxFee, 6),

      maxFeeRaw: calculated.maxFee.toString(),

      minimumReceived: formatUnits(calculated.minimumReceived, 6),

      minimumReceivedRaw: calculated.minimumReceived.toString(),

      expiresAt: Date.now() + 60_000,
    };
  }

  async create(dto: CreateBridgeDto): Promise<BridgeTransfer> {
    if (dto.direction === BridgeDirection.STELLAR_TO_EVM) {
      this.assertReverseSource(dto.sourceChain);
      return this.stellarToEvm.create(dto);
    }

    const quote = await this.quote(dto);
    const source = getEvmSourceChainDescriptor(dto.sourceChain);

    const transfer = await this.bridgeRepository.create({
      sourceChain: source.key,
      sourceChainId: source.chainId,
      sourceDomain: source.circleDomain,
      sourceUsdcAddress: source.usdcAddress,
      sourceRouterAddress: source.routerAddress,
      sourceTokenMessenger: source.tokenMessengerAddress,
      sourceMessageTransmitter: source.messageTransmitterAddress,
      evmAddress: quote.evmAddress,
      stellarAddress: quote.stellarAddress,
      amount: quote.amount,
      amountRaw: quote.amountRaw,
      fast: quote.fast,
      feeBps: quote.feeBps,
      maxFee: quote.maxFeeRaw,
      minimumReceived: quote.minimumReceived,
      status: BridgeStatus.CREATED,
    });

    return this.prepareNext(transfer);
  }

  private async prepareNext(transfer: BridgeTransfer): Promise<BridgeTransfer> {
    const amount = BigInt(transfer.amountRaw);
    const amountWithMaxFee = amount + BigInt(transfer.maxFee);
    const sourceChain = this.sourceChain(transfer);

    const allowance = await this.evm.allowance(
      sourceChain,
      transfer.evmAddress,
    );

    if (allowance < amountWithMaxFee) {
      const rawTx = await this.evm.prepareApproval(
        sourceChain,
        transfer.evmAddress,
        amountWithMaxFee,
      );

      const signingRequest: BridgeSigningRequest = {
        type: 'EVM',
        purpose: 'APPROVAL',
        rawTx,
      };

      const updated = await this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.APPROVAL_SIGNATURE_REQUIRED,
      });

      return {
        ...updated,
        signingRequest,
      };
    }

    return this.prepareBridgeTransaction(transfer);
  }

  private async prepareBridgeTransaction(
    transfer: BridgeTransfer,
  ): Promise<BridgeTransfer> {
    const sourceChain = this.sourceChain(transfer);

    const currentFeeBps = await this.evm.feeBps(sourceChain);

    if (currentFeeBps !== BigInt(transfer.feeBps)) {
      await this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.FAILED,

        error: 'Router fee changed.',
      });

      throw new BadRequestException(
        'Router fee changed. Please create a new quote.',
      );
    }

    const hook = this.stellar.buildHook(transfer.stellarAddress);

    const forwarder = this.stellar.forwarderBytes32();

    const finalityThreshold = transfer.fast ? 1000 : 2000;

    const rawTx = await this.evm.prepareBridge(
      sourceChain,
      transfer.evmAddress,

      BigInt(transfer.amountRaw),

      forwarder,

      hook,

      BigInt(transfer.maxFee),

      finalityThreshold,

      Number(transfer.feeBps),
    );

    const signingRequest: BridgeSigningRequest = {
      type: 'EVM',
      purpose: 'BRIDGE',
      rawTx,
    };

    const updated = await this.bridgeRepository.update(transfer.id, {
      status: BridgeStatus.BRIDGE_SIGNATURE_REQUIRED,
    });

    return {
      ...updated,
      signingRequest,
    };
  }

  async submitEvmSignature(id: string, signedTx: string): Promise<any> {
    const direction = await this.bridgeRepository.findById(id);
    if (direction?.direction === BridgeDirection.STELLAR_TO_EVM) {
      return this.stellarToEvm.submitEvmSignature(id, signedTx);
    }
    const transfer = await this.getTransfer(id);
    const sourceChain = this.sourceChain(transfer);

    if (transfer.status === BridgeStatus.APPROVAL_SIGNATURE_REQUIRED) {
      this.evm.verifyApproval(
        sourceChain,
        signedTx,

        transfer.evmAddress,

        BigInt(transfer.amountRaw) + BigInt(transfer.maxFee),
      );

      await this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.APPROVAL_PENDING,
      });

      const receipt = await this.evm.broadcast(sourceChain, signedTx);

      if (!receipt || receipt.status !== 1) {
        await this.fail(transfer.id, 'Approval transaction reverted.');

        throw new BadRequestException('Approval transaction reverted.');
      }

      const freshTransfer = await this.getTransfer(transfer.id);

      return this.prepareBridgeTransaction(freshTransfer);
    }

    if (transfer.status === BridgeStatus.BRIDGE_SIGNATURE_REQUIRED) {
      const hook = this.stellar.buildHook(transfer.stellarAddress);

      const forwarder = this.stellar.forwarderBytes32();

      const finalityThreshold = transfer.fast ? 1000 : 2000;

      const parsedTx = this.evm.verifyBridge(
        sourceChain,
        signedTx,

        transfer.evmAddress,

        {
          amount: BigInt(transfer.amountRaw),

          forwarder,

          hook,

          maxFee: BigInt(transfer.maxFee),

          finalityThreshold,

          userMaxFeeBps: Number(transfer.feeBps),
        },
      );

      if (!parsedTx.hash) {
        throw new BadRequestException('Signed transaction hash unavailable.');
      }

      await this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.SOURCE_PENDING,

        sourceTxHash: parsedTx.hash,
      });

      const receipt = await this.evm.broadcast(sourceChain, signedTx);

      if (!receipt || receipt.status !== 1) {
        await this.fail(transfer.id, 'Bridge transaction reverted.');

        throw new BadRequestException('Bridge transaction reverted.');
      }

      return this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.ATTESTATION_PENDING,
      });
    }

    throw new BadRequestException(
      `Transfer is not waiting for an EVM signature. Current status: ${transfer.status}`,
    );
  }

  async submitSourceTx(id: string, txHash: string): Promise<BridgeTransfer> {
    const direction = await this.bridgeRepository.findById(id);
    if (direction?.direction === BridgeDirection.STELLAR_TO_EVM) {
      return this.stellarToEvm.submitSourceTx(id, txHash);
    }

    const transfer = await this.getTransfer(id);
    const hash = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new BadRequestException('Invalid EVM transaction hash.');
    }
    if (
      ![BridgeStatus.BRIDGE_SIGNATURE_REQUIRED, BridgeStatus.SOURCE_PENDING,
      BridgeStatus.ATTESTATION_PENDING].includes(transfer.status)
    ) {
      throw new BadRequestException(
        `Transfer cannot resume from a source transaction in status: ${transfer.status}`,
      );
    }

    const sourceChain = this.sourceChain(transfer);
    const receipt = await this.evm.receipt(sourceChain, hash);
    if (!receipt) {
      throw new BadRequestException('Source transaction is not confirmed yet.');
    }
    if (receipt.status !== 1) {
      throw new BadRequestException('Source transaction reverted.');
    }
    const matches = await this.evm.matchesBridgeTransaction(
      sourceChain,
      hash,
      transfer.evmAddress,
      {
        amount: BigInt(transfer.amountRaw),
        forwarder: this.stellar.forwarderBytes32(),
        hook: this.stellar.buildHook(transfer.stellarAddress),
        maxFee: BigInt(transfer.maxFee),
        finalityThreshold: transfer.fast ? 1000 : 2000,
        userMaxFeeBps: Number(transfer.feeBps),
      },
    );
    if (!matches) {
      throw new BadRequestException(
        'Source transaction does not match this bridge transfer.',
      );
    }

    const updated = await this.bridgeRepository.update(transfer.id, {
      sourceTxHash: hash,
      status: BridgeStatus.ATTESTATION_PENDING,
      error: null,
    });
    return updated;
  }

  async getStatus(id: string): Promise<BridgeTransfer> {
    const direction = await this.bridgeRepository.findById(id);
    if (direction?.direction === BridgeDirection.STELLAR_TO_EVM) {
      return this.stellarToEvm.status(id);
    }
    const transfer = await this.getTransfer(id);

    switch (transfer.status) {
      case BridgeStatus.SOURCE_PENDING:
        return this.checkSourceTransaction(transfer);

      case BridgeStatus.ATTESTATION_PENDING:
        return this.checkAttestation(transfer);

      case BridgeStatus.DESTINATION_PENDING:
        return this.checkDestinationTransaction(transfer);

      default:
        return transfer;
    }
  }

  private async checkSourceTransaction(
    transfer: BridgeTransfer,
  ): Promise<BridgeTransfer> {
    if (!transfer.sourceTxHash) {
      throw new InternalServerErrorException(
        'Source transaction hash missing.',
      );
    }

    const receipt = await this.evm.receipt(
      this.sourceChain(transfer),
      transfer.sourceTxHash,
    );

    if (!receipt) {
      return transfer;
    }

    if (receipt.status !== 1) {
      return this.fail(transfer.id, 'Bridge transaction reverted.');
    }

    return this.bridgeRepository.update(transfer.id, {
      status: BridgeStatus.ATTESTATION_PENDING,
    });
  }

  private async checkAttestation(
    transfer: BridgeTransfer,
  ): Promise<BridgeTransfer> {
    if (!transfer.sourceTxHash) {
      throw new InternalServerErrorException(
        'Source transaction hash missing.',
      );
    }

    const source = getEvmSourceChainDescriptor(this.sourceChain(transfer));
    const result = await this.circle.getAttestation(
      transfer.sourceTxHash,
      transfer.sourceDomain ?? source.circleDomain,
    );

    if (!result) {
      return transfer;
    }

    const expectedHook = this.stellar
      .buildHook(transfer.stellarAddress)
      .slice(2)
      .toLowerCase();

    const message = result.message.toLowerCase();

    if (!message.endsWith(expectedHook)) {
      await this.fail(transfer.id, 'Circle message recipient mismatch.');

      throw new BadRequestException('Circle message recipient mismatch.');
    }

    if (this.stellar.isBackendMintRelayerEnabled?.()) {
      const submitted = await this.stellar.submitRelayerMint(
        result.message,
        result.attestation,
      );
      return this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.DESTINATION_PENDING,
        message: result.message,
        attestation: result.attestation,
        destinationTxHash: submitted.hash,
        error: null,
      });
    }

    const xdr = await this.stellar.buildMintTransaction(
      transfer.stellarAddress,
      result.message,
      result.attestation,
    );

    const updated = await this.bridgeRepository.update(transfer.id, {
      status: BridgeStatus.STELLAR_SIGNATURE_REQUIRED,

      message: result.message,

      attestation: result.attestation,

      stellarUnsignedXdr: xdr,
    });

    return {
      ...updated,

      signingRequest: {
        type: 'STELLAR',
        purpose: 'MINT',
        xdr,
      },
    };
  }

  async submitStellarSignature(
    id: string,
    signedXdr: string,
  ): Promise<BridgeTransfer> {
    const direction = await this.bridgeRepository.findById(id);
    if (direction?.direction === BridgeDirection.STELLAR_TO_EVM) {
      return this.stellarToEvm.submitStellarSignature(id, signedXdr);
    }
    const transfer = await this.getTransfer(id);

    if (transfer.status !== BridgeStatus.STELLAR_SIGNATURE_REQUIRED) {
      throw new BadRequestException(
        `Transfer is not waiting for a Stellar signature. Current status: ${transfer.status}`,
      );
    }

    if (!transfer.stellarUnsignedXdr) {
      throw new InternalServerErrorException('Prepared Stellar XDR missing.');
    }

    const result = await this.stellar.submitSignedXdr(
      transfer.stellarUnsignedXdr,
      signedXdr,
      transfer.stellarAddress,
    );

    return this.bridgeRepository.update(transfer.id, {
      status: BridgeStatus.DESTINATION_PENDING,

      destinationTxHash: result.hash,
    });
  }

  private async checkDestinationTransaction(
    transfer: BridgeTransfer,
  ): Promise<BridgeTransfer> {
    if (!transfer.destinationTxHash) {
      throw new InternalServerErrorException(
        'Destination transaction hash missing.',
      );
    }

    const result = await this.stellar.getTransaction(
      transfer.destinationTxHash,
    );

    if (!result || result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      return transfer;
    }

    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return this.bridgeRepository.update(transfer.id, {
        status: BridgeStatus.COMPLETED,

        stellarUnsignedXdr: null,
      });
    }

    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      return this.fail(transfer.id, 'Stellar destination transaction failed.');
    }

    return transfer;
  }

  private async getTransfer(id: string): Promise<BridgeTransfer> {
    const transfer = await this.bridgeRepository.findById(id);

    if (!transfer) {
      throw new NotFoundException('Bridge transfer not found.');
    }

    if (
      transfer.status === BridgeStatus.STELLAR_SIGNATURE_REQUIRED &&
      transfer.stellarUnsignedXdr
    ) {
      return {
        ...transfer,

        signingRequest: {
          type: 'STELLAR',
          purpose: 'MINT',
          xdr: transfer.stellarUnsignedXdr,
        },
      };
    }

    return transfer;
  }

  private sourceChain(transfer: BridgeTransfer): EvmSourceChain {
    const sourceChain = transfer.sourceChain ?? EvmSourceChain.SEPOLIA;
    const source = getEvmSourceChainDescriptor(sourceChain);
    const snapshots = [
      [transfer.sourceChainId, source.chainId],
      [transfer.sourceDomain, source.circleDomain],
      [transfer.sourceRouterAddress, source.routerAddress],
      [transfer.sourceUsdcAddress, source.usdcAddress],
      [transfer.sourceTokenMessenger, source.tokenMessengerAddress],
      [transfer.sourceMessageTransmitter, source.messageTransmitterAddress],
    ] as const;
    for (const [persisted, expected] of snapshots) {
      if (
        persisted != null &&
        String(persisted).toLowerCase() !== String(expected).toLowerCase()
      ) {
        throw new BadRequestException('Bridge source route snapshot changed');
      }
    }
    return sourceChain;
  }

  private assertReverseSource(sourceChain?: EvmSourceChain): void {
    if (sourceChain && sourceChain !== EvmSourceChain.SEPOLIA) {
      throw new BadRequestException(
        'Stellar to EVM bridge currently supports Sepolia only',
      );
    }
  }

  private async fail(id: string, error: string): Promise<BridgeTransfer> {
    return this.bridgeRepository.update(id, {
      status: BridgeStatus.FAILED,

      error,
    });
  }
}
