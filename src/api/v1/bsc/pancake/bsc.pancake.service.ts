import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ChainId, Token, WETH9, Fetcher, Route, Trade, TradeType, CurrencyAmount, Percent } from '@pancakeswap/sdk';
import { ethers } from 'ethers';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { PancakeSwapParams, PancakeSwapQuote, PancakeSwapQuoteParams } from '../../common/interface/swap.interface';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { BSC_APPROVAL_ABI, BSC_APPROVAL_SUBMIT_ABI, BSC_SWAP_PREPARE_ABI, BSC_TOKEN_ABI } from '../../common/abi/bsc';



@Injectable()
export class PancakeSwapService {
    private readonly chainId = ChainId.BSC;
    private readonly ethersProvider: ethers.JsonRpcProvider;
    private readonly viemProvider: any;
    private readonly WBNB = WETH9[this.chainId];
    private readonly ROUTER_ADDRESS = process.env.BSC_SWAP_ROUTER_ADD as string;

    constructor() {
        this.ethersProvider = new ethers.JsonRpcProvider(process.env.PROVIDER_RPC_BSC as string);
        this.viemProvider = createPublicClient({
            chain: bsc,
            transport: http(process.env.PROVIDER_RPC_BSC as string)
        });
    }

    private async getToken(tokenAddress: string): Promise<Token> {
        if (tokenAddress.toLowerCase() === 'native' || tokenAddress === ethers.ZeroAddress) {
            return this.WBNB;
        }
    
        const tokenContract = new ethers.Contract(
            tokenAddress,
            BSC_TOKEN_ABI,
            this.ethersProvider
        );
    
        try {
            const [decimalsRaw, symbol, name] = await Promise.all([
                tokenContract.decimals(),
                tokenContract.symbol(),
                tokenContract.name()
            ]);
    
            const decimals = Number(decimalsRaw);
    
            console.log("tokenContract:-", this.chainId, tokenAddress, decimals, symbol);
    
            return new Token(this.chainId, tokenAddress as `0x${string}`, decimals, symbol, name);
        } catch (error) {
            throw new HttpException(
                `Invalid token address: ${tokenAddress}. Error: ${error}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    async getSwapQuote(params: SwapQuoteDto): Promise<any> {
        try {
          const { tokenIn, tokenOut, amount, slippage = 1 } = params;
          const fromToken = await this.getToken(tokenIn.address);
          const toToken = await this.getToken(tokenOut.address);
      
          const currencyAmount = CurrencyAmount.fromRawAmount(
            fromToken,
            ethers.parseUnits(amount, fromToken.decimals).toString()
          );
          const pair = await Fetcher.fetchPairData(fromToken, toToken, this.viemProvider);
          const route = new Route([pair], fromToken, toToken);
          const trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
          const slippageTolerance = new Percent(Math.floor(slippage * 100), '10000');
          const minimumAmountOut = trade.minimumAmountOut(slippageTolerance);
          const formattedAmountOut = trade.outputAmount.toExact();
          const pricePerToken = trade.executionPrice.invert(); 
      
          return {
            inputAmount: amount,
            inputToken: tokenIn.symbol,
            outputAmount: formattedAmountOut,
            outputToken: tokenOut.symbol,
            pricePerToken: pricePerToken.toSignificant(6),
            fee: (3000).toString(), 
          };
        } catch (error) {
          console.error('Quote error:', error);
          throw new HttpException('Failed to get swap quote', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
      

    async createUnsignedSwapTransaction(params: SwapQuoteDto): Promise<{
        transaction: any;
        approvalTransaction?: any;
        quote: PancakeSwapQuote;
    }> {
        try {
            const { tokenIn, tokenOut, amount, slippage = 1 } = params;
            const quote = await this.getSwapQuote(params);
            const fromToken = await this.getToken(tokenIn.address);
            const toToken = await this.getToken(tokenOut.address);
            const currencyAmount = CurrencyAmount.fromRawAmount(
                fromToken,
                ethers.parseUnits(amount, fromToken.decimals).toString()
            );

            
            const pair = await Fetcher.fetchPairData(fromToken, toToken, this.viemProvider);
            const route = new Route([pair], fromToken, toToken);
            const trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
            const slippageTolerance = new Percent(Math.floor(slippage * 100), '10000');
            const minimumAmountOut = trade.minimumAmountOut(slippageTolerance);
            
            const routerInterface = new ethers.Interface(BSC_SWAP_PREPARE_ABI);
            
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
            const path = trade.route.path.map(token => token.address);
            const nonce = await this.ethersProvider.getTransactionCount(fromToken.address);
            const feeData = await this.ethersProvider.getFeeData();
            const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei');
            
            let swapTransaction: any;
            let approvalTransaction: any = null;

            if (fromToken.address === this.WBNB.address) {
                const data = routerInterface.encodeFunctionData('swapExactETHForTokens', [
                    minimumAmountOut.quotient.toString(),
                    path,
                    fromToken.address,
                    deadline
                ]);

                swapTransaction = {
                    to: this.ROUTER_ADDRESS,
                    value: currencyAmount.quotient.toString(),
                    data,
                    gasLimit: '300000',
                    gasPrice: gasPrice.toString(),
                    nonce,
                    chainId: this.chainId
                };

            } else if (toToken.address === this.WBNB.address) {
                const needsApproval = await this.checkApprovalNeeded(
                    fromToken.address,
                    fromToken.address,
                    currencyAmount.quotient.toString()
                );

                if (needsApproval) {
                    approvalTransaction = await this.createApprovalTransaction(fromToken.address, fromToken.address, nonce);
                }

                const data = routerInterface.encodeFunctionData('swapExactTokensForETH', [
                    currencyAmount.quotient.toString(),
                    minimumAmountOut.quotient.toString(),
                    path,
                    fromToken.address,
                    deadline
                ]);

                swapTransaction = {
                    to: this.ROUTER_ADDRESS,
                    value: '0',
                    data,
                    gasLimit: '300000',
                    gasPrice: gasPrice.toString(),
                    nonce: needsApproval ? nonce + 1 : nonce,
                    chainId: this.chainId
                };

            } else {
                const needsApproval = await this.checkApprovalNeeded(
                    fromToken.address,
                    fromToken.address,
                    currencyAmount.quotient.toString()
                );

                if (needsApproval) {
                    approvalTransaction = await this.createApprovalTransaction(fromToken.address, fromToken.address, nonce);
                }

                const data = routerInterface.encodeFunctionData('swapExactTokensForTokens', [
                    currencyAmount.quotient.toString(),
                    minimumAmountOut.quotient.toString(),
                    path,
                    fromToken.address,
                    deadline
                ]);

                swapTransaction = {
                    to: this.ROUTER_ADDRESS,
                    value: '0',
                    data,
                    gasLimit: '300000',
                    gasPrice: gasPrice.toString(),
                    nonce: needsApproval ? nonce + 1 : nonce,
                    chainId: this.chainId
                };
            }

            return {
                transaction: swapTransaction,
                approvalTransaction,
                quote
            };

        } catch (error) {
            console.error('Create unsigned transaction error:', error);
            throw new HttpException('Failed to create unsigned transaction', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async broadcastTransaction(signedTx: string): Promise<{ txHash: string; receipt?: any }> {
        try {
            const tx = await this.ethersProvider.broadcastTransaction(signedTx);
            const receipt = await tx.wait();

            return {
                txHash: tx.hash,
                receipt
            };

        } catch (error) {
            console.error('Broadcast error:', error);
            throw new HttpException('Failed to broadcast transaction', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private async checkApprovalNeeded(tokenAddress: string, ownerAddress: string, amount: string): Promise<boolean> {
        const tokenContract = new ethers.Contract(
            tokenAddress,
            BSC_APPROVAL_ABI,
            this.ethersProvider
        );

        const allowance = await tokenContract.allowance(ownerAddress, this.ROUTER_ADDRESS);
        return allowance < BigInt(amount);
    }

    private async createApprovalTransaction(tokenAddress: string, fromToken: string, nonce: number): Promise<any> {
        const tokenInterface = new ethers.Interface(BSC_APPROVAL_SUBMIT_ABI);

        const data = tokenInterface.encodeFunctionData('approve', [
            this.ROUTER_ADDRESS,
            ethers.MaxUint256
        ]);

        const feeData = await this.ethersProvider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei');

        return {
            to: tokenAddress,
            value: '0',
            data,
            gasLimit: '100000',
            gasPrice: gasPrice.toString(),
            nonce,
            chainId: this.chainId
        };
    }

    async estimateSwapGas(params: SwapQuoteDto): Promise<string> {
        try {
            const { transaction } = await this.createUnsignedSwapTransaction(params);

            const estimatedGas = await this.ethersProvider.estimateGas({
                to: transaction.to,
                value: transaction.value,
                data: transaction.data
            });

            return estimatedGas.toString();
        } catch (error) {
            console.error('Gas estimation failed:', error);
            return '300000';
        }
    }
}