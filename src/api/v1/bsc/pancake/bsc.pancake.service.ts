import { Injectable, HttpException, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { ChainId, Token, WETH9, Fetcher, Route, Trade, TradeType, CurrencyAmount, Percent } from '@pancakeswap/sdk';
import { ethers } from 'ethers';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { PancakeSwapParams, PancakeSwapQuote, PancakeSwapQuoteParams } from '../../common/interface/swap.interface';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { BSC_APPROVAL_ABI, BSC_APPROVAL_SUBMIT_ABI, BSC_SWAP_PREPARE_ABI, BSC_TOKEN_ABI } from '../../common/abi/bsc';

@Injectable()
export class PancakeSwapService {
    private readonly logger = new Logger(PancakeSwapService.name);
    private readonly chainId = ChainId.BSC;
    private readonly ethersProvider: ethers.JsonRpcProvider;
    private readonly viemProvider: any;
    private readonly WBNB = WETH9[this.chainId];
    private readonly ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    private readonly BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
    private readonly USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

    constructor() {
        this.ethersProvider = new ethers.JsonRpcProvider(process.env.PROVIDER_RPC_BSC as string);
        this.viemProvider = createPublicClient({
            chain: bsc,
            transport: http(process.env.PROVIDER_RPC_BSC as string)
        });
    }

    private isNativeToken(address: string): boolean {
        if (!address) return false;
        const NATIVE_ADDRESSES = [
            '0X0000000000000000000000000000000000000000',
            '0XEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
            'BNB',
            'NATIVE',
        ];
        return NATIVE_ADDRESSES.includes(address.toUpperCase());
    }

    private async getToken(tokenAddress: string): Promise<Token> {
        if (this.isNativeToken(tokenAddress)) {
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

            this.logger.log(`Token loaded: ${symbol} (${tokenAddress}) with ${decimals} decimals`);

            return new Token(this.chainId, tokenAddress as `0x${string}`, decimals, symbol, name);
        } catch (error) {
            throw new BadRequestException(
                `Invalid token address: ${tokenAddress}. Error: ${error.message}`
            );
        }
    }

    async getSwapQuote(params: SwapQuoteDto): Promise<any> {
        try {
            const { tokenIn, tokenOut, amount, slippage = 1 } = params;
            const isNativeIn = this.isNativeToken(tokenIn.address);
            const isNativeOut = this.isNativeToken(tokenOut.address);

            const tokenInAddress = isNativeIn ? this.WBNB.address : tokenIn.address;
            const tokenOutAddress = isNativeOut ? this.WBNB.address : tokenOut.address;

            const fromToken = await this.getToken(tokenInAddress);
            const toToken = await this.getToken(tokenOutAddress);

            const currencyAmount = CurrencyAmount.fromRawAmount(
                fromToken,
                ethers.parseUnits(amount, fromToken.decimals).toString()
            );

            let trade: Trade<Token, Token, TradeType.EXACT_INPUT> | null = null;
            let routePath = 'direct';

            try {
                const pair = await Fetcher.fetchPairData(fromToken, toToken, this.viemProvider);
                const route = new Route([pair], fromToken, toToken);
                trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                this.logger.log('Direct swap route found');
            } catch (error) {
                this.logger.warn('Direct swap not available, trying multi-hop...');
            }

            if (!trade) {
                try {
                    const pair1 = await Fetcher.fetchPairData(fromToken, this.WBNB, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(this.WBNB, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    routePath = 'multi-hop-wbnb';
                    this.logger.log('Multi-hop swap found via WBNB');
                } catch (error) {
                    this.logger.warn('Multi-hop via WBNB failed');
                }
            }

            if (!trade && fromToken.address.toLowerCase() !== this.BUSD_ADDRESS.toLowerCase()) {
                try {
                    const busdToken = await this.getToken(this.BUSD_ADDRESS);
                    const pair1 = await Fetcher.fetchPairData(fromToken, busdToken, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(busdToken, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    routePath = 'multi-hop-busd';
                    this.logger.log('Multi-hop swap found via BUSD');
                } catch (error) {
                    this.logger.warn('Multi-hop via BUSD failed');
                }
            }

            if (!trade && fromToken.address.toLowerCase() !== this.USDT_ADDRESS.toLowerCase()) {
                try {
                    const usdtToken = await this.getToken(this.USDT_ADDRESS);
                    const pair1 = await Fetcher.fetchPairData(fromToken, usdtToken, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(usdtToken, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    routePath = 'multi-hop-usdt';
                    this.logger.log('Multi-hop swap found via USDT');
                } catch (error) {
                    this.logger.warn('Multi-hop via USDT failed');
                }
            }

            if (!trade) {
                throw new BadRequestException(
                    `No liquidity pool found for ${tokenIn.symbol} -> ${tokenOut.symbol}. This pair may not be tradeable on PancakeSwap.`
                );
            }

            const formattedAmountOut = trade.outputAmount.toExact();
            const pricePerToken = trade.executionPrice.invert();

            return {
                inputAmount: amount,
                inputToken: isNativeIn ? 'BNB' : tokenIn.symbol,
                outputAmount: formattedAmountOut,
                outputToken: isNativeOut ? 'BNB' : tokenOut.symbol,
                pricePerToken: pricePerToken.toSignificant(6),
                fee: '3000',
                route: routePath,
                path: trade.route.path.map(t => t.symbol).join(' -> '),
            };
        } catch (error) {
            this.logger.error('Quote error:', error);
            const message = error.message || 'Failed to get swap quote';
            throw new BadRequestException(message);
        }
    }

    async createUnsignedSwapTransaction(params: SwapQuoteDto): Promise<any[]> {
        try {
            const { tokenIn, tokenOut, amount, slippage = 1, recipient } = params;
            
            if (!recipient) {
                throw new BadRequestException('Recipient address is required');
            }

            const isNativeIn = this.isNativeToken(tokenIn.address);
            const isNativeOut = this.isNativeToken(tokenOut.address);
            
            const tokenInAddress = isNativeIn ? this.WBNB.address : tokenIn.address;
            const tokenOutAddress = isNativeOut ? this.WBNB.address : tokenOut.address;

            const fromToken = await this.getToken(tokenInAddress);
            const toToken = await this.getToken(tokenOutAddress);

            const currencyAmount = CurrencyAmount.fromRawAmount(
                fromToken,
                ethers.parseUnits(amount, fromToken.decimals).toString()
            );

            let trade: Trade<Token, Token, TradeType.EXACT_INPUT> | null = null;
            let isMultiHop = false;

            try {
                const pair = await Fetcher.fetchPairData(fromToken, toToken, this.viemProvider);
                const route = new Route([pair], fromToken, toToken);
                trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
            } catch (error) {
                isMultiHop = true;
            }

            if (!trade) {
                try {
                    const pair1 = await Fetcher.fetchPairData(fromToken, this.WBNB, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(this.WBNB, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                } catch (error) {
                    try {
                        const busdToken = await this.getToken(this.BUSD_ADDRESS);
                        const pair1 = await Fetcher.fetchPairData(fromToken, busdToken, this.viemProvider);
                        const pair2 = await Fetcher.fetchPairData(busdToken, toToken, this.viemProvider);
                        const route = new Route([pair1, pair2], fromToken, toToken);
                        trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    } catch (error) {
                        const usdtToken = await this.getToken(this.USDT_ADDRESS);
                        const pair1 = await Fetcher.fetchPairData(fromToken, usdtToken, this.viemProvider);
                        const pair2 = await Fetcher.fetchPairData(usdtToken, toToken, this.viemProvider);
                        const route = new Route([pair1, pair2], fromToken, toToken);
                        trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    }
                }
            }

            if (!trade) {
                throw new BadRequestException('No route found for this token pair');
            }

            const slippageTolerance = new Percent(Math.floor(slippage * 100), '10000');
            const minimumAmountOut = trade.minimumAmountOut(slippageTolerance);
            
            const routerInterface = new ethers.Interface(BSC_SWAP_PREPARE_ABI);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
            const path = trade.route.path.map(token => token.address);

            const fromAddress = recipient;
            const [nonce, feeData, balance] = await Promise.all([
                this.ethersProvider.getTransactionCount(fromAddress, 'pending'),
                this.ethersProvider.getFeeData(),
                this.ethersProvider.getBalance(fromAddress)
            ]);

            const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei');
            const txs: any[] = [];

            if (isNativeIn) {
                const estimatedGas = isMultiHop ? 350000n : 250000n;
                const estimatedGasCost = estimatedGas * gasPrice;
                const totalRequired = BigInt(currencyAmount.quotient.toString()) + estimatedGasCost;

                if (balance < totalRequired) {
                    const balanceEth = ethers.formatUnits(balance, 18);
                    const requiredEth = ethers.formatUnits(totalRequired, 18);
                    throw new BadRequestException(
                        `Insufficient BNB balance. Have: ${balanceEth} BNB, Need: ~${requiredEth} BNB (swap + gas)`
                    );
                }

                const data = routerInterface.encodeFunctionData('swapExactETHForTokens', [
                    minimumAmountOut.quotient.toString(),
                    path,
                    recipient,
                    deadline
                ]);

                const swapTx = {
                    to: this.ROUTER_ADDRESS,
                    from: fromAddress,
                    value: currencyAmount.quotient.toString(),
                    data,
                    chainId: this.chainId,
                    nonce,
                    gasPrice: gasPrice.toString(),
                };

                try {
                    const estimatedGas = await this.ethersProvider.estimateGas(swapTx);
                    swapTx['gasLimit'] = ((estimatedGas * 110n) / 100n).toString();
                } catch (gasError) {
                    swapTx['gasLimit'] = isMultiHop ? '350000' : '250000';
                    this.logger.warn('Gas estimation failed, using default');
                }

                txs.push(swapTx);

            } else {
                const estimatedGasForApprove = 60000n;
                const estimatedGasForSwap = isMultiHop ? 350000n : 250000n;
                const estimatedTotalGas = estimatedGasForApprove + estimatedGasForSwap;
                const estimatedGasCost = estimatedTotalGas * gasPrice;

                if (balance < estimatedGasCost) {
                    const balanceEth = ethers.formatUnits(balance, 18);
                    const requiredEth = ethers.formatUnits(estimatedGasCost, 18);
                    throw new BadRequestException(
                        `Insufficient BNB for gas fees. Have: ${balanceEth} BNB, Need: ~${requiredEth} BNB`
                    );
                }

                const tokenContract = new ethers.Contract(fromToken.address, BSC_TOKEN_ABI, this.ethersProvider);
                const tokenBalance = await tokenContract.balanceOf(fromAddress);

                if (tokenBalance < BigInt(currencyAmount.quotient.toString())) {
                    const balanceFormatted = ethers.formatUnits(tokenBalance, fromToken.decimals);
                    const requiredFormatted = ethers.formatUnits(currencyAmount.quotient.toString(), fromToken.decimals);
                    throw new BadRequestException(
                        `Insufficient ${fromToken.symbol} balance. Have: ${balanceFormatted}, Need: ${requiredFormatted}`
                    );
                }

                let currentNonce = nonce;

                const needsApproval = await this.checkApprovalNeeded(
                    fromToken.address,
                    fromAddress,
                    currencyAmount.quotient.toString()
                );

                if (needsApproval) {
                    const tokenInterface = new ethers.Interface(BSC_APPROVAL_SUBMIT_ABI);
                    const approveData = tokenInterface.encodeFunctionData('approve', [
                        this.ROUTER_ADDRESS,
                        ethers.MaxUint256
                    ]);

                    const approveTx = {
                        to: fromToken.address,
                        from: fromAddress,
                        value: '0',
                        data: approveData,
                        chainId: this.chainId,
                        nonce: currentNonce,
                        gasPrice: gasPrice.toString(),
                    };

                    try {
                        const approveGas = await this.ethersProvider.estimateGas(approveTx);
                        approveTx['gasLimit'] = ((approveGas * 110n) / 100n).toString();
                    } catch (gasError) {
                        approveTx['gasLimit'] = '60000';
                        this.logger.warn('Approve gas estimation failed, using default');
                    }

                    txs.push(approveTx);
                    currentNonce += 1;
                }

                const functionName = isNativeOut ? 'swapExactTokensForETH' : 'swapExactTokensForTokens';
                const data = routerInterface.encodeFunctionData(functionName, [
                    currencyAmount.quotient.toString(),
                    minimumAmountOut.quotient.toString(),
                    path,
                    recipient,
                    deadline
                ]);

                const swapTx = {
                    to: this.ROUTER_ADDRESS,
                    from: fromAddress,
                    value: '0',
                    data,
                    chainId: this.chainId,
                    nonce: currentNonce,
                    gasPrice: gasPrice.toString(),
                };

                try {
                    const estimatedGas = await this.ethersProvider.estimateGas(swapTx);
                    swapTx['gasLimit'] = ((estimatedGas * 110n) / 100n).toString();
                } catch (gasError) {
                    swapTx['gasLimit'] = isMultiHop ? '350000' : '250000';
                    this.logger.warn('Swap gas estimation failed, using default');
                }

                txs.push(swapTx);
            }

            return txs;

        } catch (error) {
            this.logger.error('Prepare swap tx error:', error);
            const message =
                error.info?.error?.message ||
                error.shortMessage ||
                error.message ||
                'Failed prepare swap tx';
            throw new BadRequestException(message);
        }
    }

    async broadcastTransaction(signedTxs: string[]): Promise<any[]> {
        try {
            const results: Array<{
                txResponse: {
                    hash: string;
                    from: string;
                    to: string | null;
                    nonce: number;
                    gasLimit: string;
                    gasPrice: string;
                    data: string;
                    value: string;
                    chainId: string;
                };
                receipt: ethers.TransactionReceipt | null;
            }> = [];

            for (const signedTx of signedTxs) {
                const tx = await this.ethersProvider.broadcastTransaction(signedTx);
                const receipt = await tx.wait();

                results.push({
                    txResponse: {
                        hash: tx.hash,
                        from: tx.from,
                        to: tx.to,
                        nonce: tx.nonce,
                        gasLimit: tx.gasLimit?.toString() || '0',
                        gasPrice: tx.gasPrice?.toString() || '0',
                        data: tx.data,
                        value: tx.value?.toString() || '0',
                        chainId: tx.chainId?.toString() || '56',
                    },
                    receipt: receipt
                });
            }

            return results;

        } catch (error) {
            this.logger.error('Broadcast error:', error);
            throw new BadRequestException('Failed to broadcast transaction');
        }
    }

    private async checkApprovalNeeded(tokenAddress: string, ownerAddress: string, amount: string): Promise<boolean> {
        const tokenContract = new ethers.Contract(
            tokenAddress,
            BSC_APPROVAL_ABI,
            this.ethersProvider
        );

        try {
            const allowance = await tokenContract.allowance(ownerAddress, this.ROUTER_ADDRESS);
            return allowance < BigInt(amount);
        } catch (error) {
            this.logger.warn('Allowance check failed, assuming approval needed');
            return true;
        }
    }

    async estimateSwapGas(params: SwapQuoteDto): Promise<string> {
        try {
            const transactions = await this.createUnsignedSwapTransaction(params);
            
            let totalGas = 0n;
            for (const tx of transactions) {
                try {
                    const estimatedGas = await this.ethersProvider.estimateGas({
                        to: tx.to,
                        value: tx.value,
                        data: tx.data,
                        from: tx.from,
                    });
                    totalGas += estimatedGas;
                } catch (error) {
                    totalGas += 300000n;
                }
            }

            return totalGas.toString();
        } catch (error) {
            this.logger.error('Gas estimation failed:', error);
            return '300000';
        }
    }
}