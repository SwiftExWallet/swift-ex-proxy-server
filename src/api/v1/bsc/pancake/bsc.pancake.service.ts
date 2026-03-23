import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  ChainId,
  Token,
  WETH9,
  Fetcher,
  Route,
  Trade,
  TradeType,
  CurrencyAmount,
  Percent,
} from '@pancakeswap/sdk';
import {
  JsonRpcProvider,
  Contract,
  parseUnits,
  ZeroAddress,
  Interface,
  MaxUint256,
} from 'ethers';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { PancakeUnsignedSwapTransaction } from '../../common/interface/swap.interface';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import {
  BSC_APPROVAL_ABI,
  BSC_APPROVAL_SUBMIT_ABI,
  BSC_SWAP_PREPARE_ABI,
  BSC_TOKEN_ABI,
} from '../../common/abi/bsc';
import { AddressType } from '../../common/enums/pancake.enum';
import { ProviderService } from '../../provider/provider.service';

@Injectable()
export class PancakeSwapService {
  private readonly logger = new Logger(PancakeSwapService.name);

  private readonly chainId = ChainId.BSC;
  private readonly ethersProvider: JsonRpcProvider;
  private readonly viemProvider: any;
  private readonly WBNB = WETH9[this.chainId];
  private readonly ROUTER_ADDRESS = process.env.BSC_SWAP_ROUTER_ADD as string;

  constructor(private readonly providerService: ProviderService) {
    const rpcUrl = providerService.getRpcUrl();
    this.ethersProvider = new JsonRpcProvider(rpcUrl);
    this.viemProvider = createPublicClient({
      chain: bsc,
      transport: http(process.env.PROVIDER_RPC_BSC as string),
    });
  }

  private async getToken(tokenAddress: string): Promise<Token> {
    if (
      tokenAddress.toLowerCase() === AddressType.NATIVE ||
      tokenAddress === ZeroAddress
    ) {
      return this.WBNB;
    }

    const tokenContract: Contract = new Contract(
      tokenAddress,
      BSC_TOKEN_ABI,
      this.ethersProvider,
    );

    try {
      const [decimalsRaw, symbol, name] = await Promise.all([
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name(),
      ]);

      const decimals = Number(decimalsRaw);

      this.logger.log(
        'tokenContract:-',
        this.chainId,
        tokenAddress,
        decimals,
        symbol,
      );

      return new Token(
        this.chainId,
        tokenAddress as `0x${string}`,
        decimals,
        symbol,
        name,
      );
    } catch (error) {
      throw new HttpException(
        `Invalid token address: ${tokenAddress}. Error: ${error}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getSwapQuote(params: SwapQuoteDto): Promise<any> {
    try {
      const { tokenIn, tokenOut, amount } = params;
      const fromToken = await this.getToken(tokenIn.address);
      const toToken = await this.getToken(tokenOut.address);

      const currencyAmount = CurrencyAmount.fromRawAmount(
        fromToken,
        parseUnits(amount, fromToken.decimals).toString(),
      );
      const pair = await Fetcher.fetchPairData(
        fromToken,
        toToken,
        this.viemProvider,
      );
      const route = new Route([pair], fromToken, toToken);
      const trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
      const formattedAmountOut = trade.outputAmount.toExact();
      const pricePerToken = trade.executionPrice.invert();

      return {
        inputAmount: amount,
        inputToken: tokenIn.symbol,
        outputAmount: formattedAmountOut,
        outputToken: tokenOut.symbol,
        pricePerToken: pricePerToken.toSignificant(6),
        fee: process.env.FEE_TIER as string,
      };
    } catch (error) {
      console.error('Quote error:', error);
      throw new HttpException(
        'Failed to get swap quote',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createUnsignedSwapTransaction(
    params: SwapQuoteDto,
  ): Promise<PancakeUnsignedSwapTransaction> {
    try {
      const { tokenIn, tokenOut, amount, slippage = 1 } = params;
      const [quote, fromToken, toToken] = await Promise.all([
        this.getSwapQuote(params),
        this.getToken(tokenIn.address),
        this.getToken(tokenOut.address),
      ]);

      const currencyAmount = CurrencyAmount.fromRawAmount(
        fromToken,
        parseUnits(amount, fromToken.decimals).toString(),
      );

      const [pair, nonce, feeData] = await Promise.all([
        Fetcher.fetchPairData(fromToken, toToken, this.viemProvider),
        this.ethersProvider.getTransactionCount(fromToken.address),
        this.ethersProvider.getFeeData(),
      ]);

      const route = new Route([pair], fromToken, toToken);
      const trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);

      const slippageTolerance = new Percent(
        Math.floor(slippage * 100),
        process.env.PANCAKE_SLIPPAGE as string,
      );
      const minimumAmountOut = trade.minimumAmountOut(slippageTolerance);

      const routerInterface = new Interface(BSC_SWAP_PREPARE_ABI);

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const path = trade.route.path.map((token) => token.address);
      const gasPrice =
        feeData.gasPrice ||
        parseUnits(process.env.BSC_SLIPPAGE as string, 'gwei');

      let swapTransaction: PancakeUnsignedSwapTransaction['transaction'];
      let approvalTransaction: PancakeUnsignedSwapTransaction['approvalTransaction'] =
        null;

      if (fromToken.address === this.WBNB.address) {
        // ETH → Token
        const data = routerInterface.encodeFunctionData(
          'swapExactETHForTokens',
          [
            minimumAmountOut.quotient.toString(),
            path,
            fromToken.address,
            deadline,
          ],
        );

        swapTransaction = {
          to: this.ROUTER_ADDRESS,
          value: currencyAmount.quotient.toString(),
          data,
          gasLimit: process.env.BSC_TRANSACTION_GAS_LIMIT as string,
          gasPrice: gasPrice.toString(),
          nonce,
          chainId: this.chainId,
        };
      } else if (toToken.address === this.WBNB.address) {
        // Token → ETH
        const needsApproval = await this.checkApprovalNeeded(
          fromToken.address,
          fromToken.address,
          currencyAmount.quotient.toString(),
        );

        if (needsApproval) {
          approvalTransaction = await this.createApprovalTransaction(
            fromToken.address,
            nonce,
          );
        }

        const data = routerInterface.encodeFunctionData(
          'swapExactTokensForETH',
          [
            currencyAmount.quotient.toString(),
            minimumAmountOut.quotient.toString(),
            path,
            fromToken.address,
            deadline,
          ],
        );

        swapTransaction = {
          to: this.ROUTER_ADDRESS,
          value: '0',
          data,
          gasLimit: process.env.BSC_TRANSACTION_GAS_LIMIT as string,
          gasPrice: gasPrice.toString(),
          nonce: needsApproval ? nonce + 1 : nonce,
          chainId: this.chainId,
        };
      } else {
        // Token → Token
        const needsApproval = await this.checkApprovalNeeded(
          fromToken.address,
          fromToken.address,
          currencyAmount.quotient.toString(),
        );

        if (needsApproval) {
          approvalTransaction = await this.createApprovalTransaction(
            fromToken.address,
            nonce,
          );
        }

        const data = routerInterface.encodeFunctionData(
          'swapExactTokensForTokens',
          [
            currencyAmount.quotient.toString(),
            minimumAmountOut.quotient.toString(),
            path,
            fromToken.address,
            deadline,
          ],
        );

        swapTransaction = {
          to: this.ROUTER_ADDRESS,
          value: '0',
          data,
          gasLimit: process.env.BSC_TRANSACTION_GAS_LIMIT as string,
          gasPrice: gasPrice.toString(),
          nonce: needsApproval ? nonce + 1 : nonce,
          chainId: this.chainId,
        };
      }

      return {
        transaction: swapTransaction,
        approvalTransaction,
        quote,
      };
    } catch (error) {
      console.error('Create unsigned transaction error:', error);
      throw new HttpException(
        'Failed to create unsigned transaction',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async broadcastTransaction(
    signedTx: string,
  ): Promise<{ txHash: string; receipt?: any }> {
    try {
      const tx = await this.ethersProvider.broadcastTransaction(signedTx);
      const receipt = await tx.wait();

      return {
        txHash: tx.hash,
        receipt,
      };
    } catch (error) {
      console.error('Broadcast error:', error);
      throw new HttpException(
        'Failed to broadcast transaction',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async checkApprovalNeeded(
    tokenAddress: string,
    ownerAddress: string,
    amount: string,
  ): Promise<boolean> {
    const tokenContract = new Contract(
      tokenAddress,
      BSC_APPROVAL_ABI,
      this.ethersProvider,
    );

    const allowance = await tokenContract.allowance(
      ownerAddress,
      this.ROUTER_ADDRESS,
    );
    return allowance < BigInt(amount);
  }

  private async createApprovalTransaction(
    tokenAddress: string,
    nonce: number,
  ): Promise<any> {
    const tokenInterface = new Interface(BSC_APPROVAL_SUBMIT_ABI);

    const data = tokenInterface.encodeFunctionData('approve', [
      this.ROUTER_ADDRESS,
      MaxUint256,
    ]);

    const feeData = await this.ethersProvider.getFeeData();
    const gasPrice =
      feeData.gasPrice ||
      parseUnits(process.env.BSC_SLIPPAGE as string, 'gwei');

    return {
      to: tokenAddress,
      value: '0',
      data,
      gasLimit: process.env.PANCAKE_GAS_FEE_LIMIT as string,
      gasPrice: gasPrice.toString(),
      nonce,
      chainId: this.chainId,
    };
  }

  async estimateSwapGas(params: SwapQuoteDto): Promise<string> {
    try {
      const { transaction } = await this.createUnsignedSwapTransaction(params);

      const estimatedGas = await this.ethersProvider.estimateGas({
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
      });

      return estimatedGas.toString();
    } catch (error) {
      console.error('Gas estimation failed:', error);
      return process.env.BSC_TRANSACTION_GAS_LIMIT as string;
    }
  }
}
