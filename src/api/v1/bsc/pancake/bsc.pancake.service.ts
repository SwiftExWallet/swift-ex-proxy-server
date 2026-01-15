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
    
    // ✅ CRITICAL FIX: Manually define WBNB instead of using WETH9
    private readonly WBNB = new Token(
        ChainId.BSC,
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // Correct WBNB address
        18,
        'WBNB',
        'Wrapped BNB'
    );
    
    private readonly ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    private readonly BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
    private readonly USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

    constructor() {
        this.ethersProvider = new ethers.JsonRpcProvider(process.env.PROVIDER_RPC_BSC as string);
        this.viemProvider = createPublicClient({
            chain: bsc,
            transport: http(process.env.PROVIDER_RPC_BSC as string)
        });
        
        // ✅ Verify WBNB address on startup
        this.logger.log(`✓ WBNB Token initialized: ${this.WBNB.address}`);
    }

    private isNativeToken(address: string): boolean {
        if (!address) return false;
        const NATIVE_ADDRESSES = [
            '0X0000000000000000000000000000000000000000',
            '0XEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
            'BNB',
            'NATIVE',
            '0XBB4CDB9CBD36B01BD1CBAEBF2DE08D9173BC095C' // WBNB address
        ];
        return NATIVE_ADDRESSES.includes(address.toUpperCase());
    }

    private async getToken(tokenAddress: string): Promise<Token> {
        // ✅ Always return WBNB for native token
        if (this.isNativeToken(tokenAddress)) {
            this.logger.log('Native token detected, using WBNB');
            return this.WBNB;
        }

        // ✅ If someone passes WBNB address directly, return WBNB token
        if (tokenAddress.toLowerCase() === this.WBNB.address.toLowerCase()) {
            this.logger.log('WBNB address detected, using WBNB token');
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
            let actualPath: string[] = [];

            // ✅ STEP 1: Try Direct Route
            try {
                const pair = await Fetcher.fetchPairData(fromToken, toToken, this.viemProvider);
                const route = new Route([pair], fromToken, toToken);
                trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                actualPath = trade.route.path.map(t => t.address);
                this.logger.log('✓ Direct route found');
            } catch (error) {
                this.logger.warn('✗ Direct route not available');
            }

            // ✅ STEP 2: Try Multi-hop via WBNB
            if (!trade) {
                try {
                    const pair1 = await Fetcher.fetchPairData(fromToken, this.WBNB, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(this.WBNB, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    actualPath = trade.route.path.map(t => t.address);
                    this.logger.log('✓ Multi-hop route via WBNB found');
                } catch (error) {
                    this.logger.warn('✗ Multi-hop via WBNB failed');
                }
            }

            // ✅ STEP 3: Try Multi-hop via BUSD
            if (!trade && fromToken.address.toLowerCase() !== this.BUSD_ADDRESS.toLowerCase()) {
                try {
                    const busdToken = await this.getToken(this.BUSD_ADDRESS);
                    const pair1 = await Fetcher.fetchPairData(fromToken, busdToken, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(busdToken, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    actualPath = trade.route.path.map(t => t.address);
                    this.logger.log('✓ Multi-hop route via BUSD found');
                } catch (error) {
                    this.logger.warn('✗ Multi-hop via BUSD failed');
                }
            }

            // ✅ STEP 4: Try Multi-hop via USDT
            if (!trade && fromToken.address.toLowerCase() !== this.USDT_ADDRESS.toLowerCase()) {
                try {
                    const usdtToken = await this.getToken(this.USDT_ADDRESS);
                    const pair1 = await Fetcher.fetchPairData(fromToken, usdtToken, this.viemProvider);
                    const pair2 = await Fetcher.fetchPairData(usdtToken, toToken, this.viemProvider);
                    const route = new Route([pair1, pair2], fromToken, toToken);
                    trade = new Trade(route, currencyAmount, TradeType.EXACT_INPUT);
                    actualPath = trade.route.path.map(t => t.address);
                    this.logger.log('✓ Multi-hop route via USDT found');
                } catch (error) {
                    this.logger.warn('✗ Multi-hop via USDT failed');
                }
            }

            if (!trade || actualPath.length === 0) {
                throw new BadRequestException(
                    `No liquidity route found for ${tokenIn.symbol} → ${tokenOut.symbol}`
                );
            }

            // ✅ Debug Logging
            this.logger.log('═══════════════════════════════════════');
            this.logger.log(`From Token: ${fromToken.symbol} (${fromToken.address})`);
            this.logger.log(`To Token: ${toToken.symbol} (${toToken.address})`);
            this.logger.log(`WBNB Address: ${this.WBNB.address}`);
            this.logger.log(`Path Length: ${actualPath.length}`);
            actualPath.forEach((addr, i) => {
                const isWBNB = addr.toLowerCase() === this.WBNB.address.toLowerCase();
                this.logger.log(`  [${i}] ${addr} ${isWBNB ? '(WBNB) ✓' : ''}`);
            });
            this.logger.log(`isNativeIn: ${isNativeIn}, isNativeOut: ${isNativeOut}`);
            this.logger.log('═══════════════════════════════════════');

            // ✅ Calculate slippage & minimum output
            const slippageTolerance = new Percent(Math.floor(slippage * 100), '10000');
            const minimumAmountOut = trade.minimumAmountOut(slippageTolerance);
            
            const routerInterface = new ethers.Interface(BSC_SWAP_PREPARE_ABI);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
            const path = actualPath;
            const isMultiHop = path.length > 2;

            // ✅ Get account info
            const fromAddress = recipient;
            const [nonce, feeData, balance] = await Promise.all([
                this.ethersProvider.getTransactionCount(fromAddress, 'pending'),
                this.ethersProvider.getFeeData(),
                this.ethersProvider.getBalance(fromAddress)
            ]);

            const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei');
            const txs: any[] = [];

            // ═══════════════════════════════════════════════════════════
            // 🔥 CASE 1: BNB → Token
            // ═══════════════════════════════════════════════════════════
            if (isNativeIn) {
                const estimatedGas = isMultiHop ? 400000n : 250000n;
                const estimatedGasCost = estimatedGas * gasPrice;
                const totalRequired = BigInt(currencyAmount.quotient.toString()) + estimatedGasCost;

                if (balance < totalRequired) {
                    const balanceEth = ethers.formatUnits(balance, 18);
                    const requiredEth = ethers.formatUnits(totalRequired, 18);
                    throw new BadRequestException(
                        `Insufficient BNB. Have: ${balanceEth} BNB, Need: ~${requiredEth} BNB (${amount} BNB + gas)`
                    );
                }

                // ✅ Ensure path starts with WBNB for BNB swaps
                let swapPath = [...path];
                if (swapPath[0].toLowerCase() !== this.WBNB.address.toLowerCase()) {
                    this.logger.warn(`Fixing first address in path to WBNB`);
                    swapPath[0] = this.WBNB.address;
                }

                this.logger.log(`BNB → Token | Final Path: ${swapPath.join(' → ')}`);

                // ✅ Use SupportingFeeOnTransfer for safety
                const data = routerInterface.encodeFunctionData(
                    'swapExactETHForTokensSupportingFeeOnTransferTokens',
                    [
                        minimumAmountOut.quotient.toString(),
                        swapPath,
                        recipient,
                        deadline
                    ]
                );

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
                    swapTx['gasLimit'] = ((estimatedGas * 120n) / 100n).toString();
                    this.logger.log(`Gas estimated: ${estimatedGas.toString()}`);
                } catch (gasError) {
                    swapTx['gasLimit'] = isMultiHop ? '400000' : '250000';
                    this.logger.warn(`Gas estimation failed: ${gasError.message}`);
                }

                txs.push(swapTx);
            }
            
            // ═══════════════════════════════════════════════════════════
            // 🔥 CASE 2 & 3: Token → BNB OR Token → Token
            // ═══════════════════════════════════════════════════════════
            else {
                const estimatedGasForApprove = 60000n;
                const estimatedGasForSwap = isMultiHop ? 400000n : 250000n;
                const estimatedTotalGas = estimatedGasForApprove + estimatedGasForSwap;
                const estimatedGasCost = estimatedTotalGas * gasPrice;

                if (balance < estimatedGasCost) {
                    const balanceEth = ethers.formatUnits(balance, 18);
                    const requiredEth = ethers.formatUnits(estimatedGasCost, 18);
                    throw new BadRequestException(
                        `Insufficient BNB for gas. Have: ${balanceEth} BNB, Need: ~${requiredEth} BNB`
                    );
                }

                // ✅ Check token balance
                const tokenContract = new ethers.Contract(
                    fromToken.address,
                    BSC_TOKEN_ABI,
                    this.ethersProvider
                );
                const tokenBalance = await tokenContract.balanceOf(fromAddress);

                if (tokenBalance < BigInt(currencyAmount.quotient.toString())) {
                    const balanceFormatted = ethers.formatUnits(tokenBalance, fromToken.decimals);
                    const requiredFormatted = ethers.formatUnits(
                        currencyAmount.quotient.toString(),
                        fromToken.decimals
                    );
                    throw new BadRequestException(
                        `Insufficient ${fromToken.symbol}. Have: ${balanceFormatted}, Need: ${requiredFormatted}`
                    );
                }

                let currentNonce = nonce;

                // ✅ Handle Approval
                const needsApproval = await this.checkApprovalNeeded(
                    fromToken.address,
                    fromAddress,
                    currencyAmount.quotient.toString()
                );

                if (needsApproval) {
                    this.logger.log('Approval needed, creating approve tx...');
                    
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
                        approveTx['gasLimit'] = ((approveGas * 120n) / 100n).toString();
                    } catch (gasError) {
                        approveTx['gasLimit'] = '60000';
                        this.logger.warn('Approve gas estimation failed, using default');
                    }

                    txs.push(approveTx);
                    currentNonce += 1;
                } else {
                    this.logger.log('Approval already exists, skipping...');
                }

                // ✅ Determine correct swap function and path
                let functionName: string;
                let swapPath: string[] = [...path]; // Copy path
                
                if (isNativeOut) {
                    // Token → BNB
                    functionName = 'swapExactTokensForETHSupportingFeeOnTransferTokens';
                    
                    // ✅ CRITICAL: Last address MUST be WBNB for ETH swaps
                    const lastAddress = swapPath[swapPath.length - 1].toLowerCase();
                    const wbnbAddress = this.WBNB.address.toLowerCase();
                    
                    if (lastAddress !== wbnbAddress) {
                        this.logger.warn(`Fixing path: last token ${lastAddress.slice(0, 6)} → WBNB ${wbnbAddress.slice(0, 6)}`);
                        swapPath[swapPath.length - 1] = this.WBNB.address;
                    }
                    
                    this.logger.log(`Token → BNB | Final Path: ${swapPath.join(' → ')}`);
                } else {
                    // Token → Token
                    functionName = 'swapExactTokensForTokensSupportingFeeOnTransferTokens';
                    this.logger.log(`Token → Token | Final Path: ${swapPath.join(' → ')}`);
                }

                const data = routerInterface.encodeFunctionData(functionName, [
                    currencyAmount.quotient.toString(),
                    minimumAmountOut.quotient.toString(),
                    swapPath, // ✅ Use fixed path
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
                    swapTx['gasLimit'] = ((estimatedGas * 120n) / 100n).toString();
                    this.logger.log(`Swap gas estimated: ${estimatedGas.toString()}`);
                } catch (gasError) {
                    swapTx['gasLimit'] = isMultiHop ? '400000' : '250000';
                    this.logger.warn(`Swap gas estimation failed: ${gasError.message}`);
                }

                txs.push(swapTx);
            }

            this.logger.log(`✓ Created ${txs.length} transaction(s)`);
            return txs;

        } catch (error) {
            this.logger.error('❌ Transaction preparation failed:', error);
            const message =
                error.info?.error?.message ||
                error.shortMessage ||
                error.message ||
                'Failed to prepare swap transaction';
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