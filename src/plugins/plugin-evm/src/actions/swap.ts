import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import {
    composeContext,
    elizaLogger,
    generateObjectDeprecated,
    ModelClass,
} from "@elizaos/core";
import {
    createConfig,
    EVM,
    executeRoute,
    ExtendedChain,
    getRoutes,
    getStatus,
    getStepTransaction,
    Route,
} from "@lifi/sdk";

import { evmWalletProvider, initWalletProvider, WalletProvider } from "../providers/wallet.js";
import { swapTemplate } from "../templates/index.js";
import type { SupportedChain, SwapParams, Transaction } from "../types/index.js";
import { sendTransaction, sendRawTransaction } from "viem/actions";
import { Address, Client, Hex, parseEther, SendTransactionParameters, WalletClient } from "viem";

export { swapTemplate };

export class SwapAction {
    private config;
    private walletClient: WalletClient;

    constructor(private walletProvider: WalletProvider) {
        this.walletClient = walletProvider.getWalletClient(walletProvider.getCurrentChain().name as SupportedChain) as WalletClient
        console.log("count chains", Object.keys(walletProvider.chains).length);
        this.config = createConfig({
            integrator: "eliza",
            preloadChains: false,
            providers: [EVM({
                getWalletClient: async () => {
                    return new Promise<Client>((resolve) => {
                        const client = walletProvider.getWalletClient(walletProvider.getCurrentChain().name as SupportedChain)
                        resolve(client as Client)
                    })
                },
                switchChain: async (chainId: number) => {
                    // Encontrar a chain correta pelo ID
                    const chainName = Object.keys(walletProvider.chains).find(
                        (name) => walletProvider.chains[name].id === chainId
                    ) as SupportedChain;

                    if (!chainName) {
                        throw new Error(`Chain ID ${chainId} não encontrada`);
                    }

                    // Trocar para a nova chain
                    walletProvider.switchChain(chainName);

                    // Retornar o novo wallet client para a chain correta
                    return walletProvider.getWalletClient(chainName) as Client;
                }
            })],
            chains: Object.values(this.walletProvider.chains).map((config) => {
                // console.log("Config blockExplorers", config.blockExplorers);
                // console.log("Config rpcUrls", config.rpcUrls);
                if (!config) {
                    elizaLogger.error("config is null");
                    return;
                }
                if (!config.rpcUrls) {
                    elizaLogger.error("config.rpcUrls is null");
                    return;
                }

                return ({
                    id: config.id,
                    name: config.name,
                    key: config.name.toLowerCase(),
                    chainType: "EVM" as const,
                    nativeToken: {
                        ...config.nativeCurrency,
                        chainId: config.id,
                        address: "0x0000000000000000000000000000000000000000",
                        coinKey: config.nativeCurrency.symbol,
                        priceUSD: "0",
                        logoURI: "",
                        symbol: config.nativeCurrency.symbol,
                        decimals: config.nativeCurrency.decimals,
                        name: config.nativeCurrency.name,
                    },
                    rpcUrls: {
                        public: { http: [config?.rpcUrls?.default.http[0]] },
                    },
                    blockExplorerUrls: [config.blockExplorers?.default.url],
                    metamask: {
                        chainId: `0x${config.id.toString(16)}`,
                        chainName: config.name,
                        nativeCurrency: config.nativeCurrency,
                        rpcUrls: [config?.rpcUrls?.default.http[0]],
                        blockExplorerUrls: [config.blockExplorers?.default.url],
                    },
                    coin: config.nativeCurrency.symbol,
                    mainnet: true,
                    diamondAddress: "0x0000000000000000000000000000000000000000",
                })
            }) as ExtendedChain[],
        });
    }

    async swap(params: SwapParams): Promise<Transaction> {
        elizaLogger.info("Swapping tokens on chain", params.chain);
        console.log("Swapping tokens on chain", params.chain);
        const walletClient = this.walletProvider.getWalletClient(params.chain);
        const [fromAddress] = await walletClient.getAddresses();
        elizaLogger.info("From address", fromAddress);
        console.log("From address", fromAddress);

        // Converte o amount para BigNumber string
        const fromAmount = BigInt(parseEther(params.amount)).toString();
        console.log("fromAmount", fromAmount);
        const routes = await getRoutes({
            fromChainId: this.walletProvider.getChainConfigs(params.chain).id,
            toChainId: this.walletProvider.getChainConfigs(params.chain).id,
            fromTokenAddress: params.fromToken,
            toTokenAddress: params.toToken,
            fromAmount: fromAmount, // Usa o valor convertido
            fromAddress: fromAddress,
            options: {
                slippage: params.slippage || 0.5,
                order: "RECOMMENDED",

            },
        });

        if (!routes.routes.length) throw new Error("No routes found");

        // console.log("routes", routes);

        // console.log("this.config", this.config);

        const execution = await executeRoute(routes.routes[0], {
            updateRouteHook: (route) => {
                console.log(route)
            }
        });

        // return this.executeRouteSteps(routes.routes[0]);


        // console.log("execution", execution);

        const process = execution.steps[0]?.execution?.process[0];

        // console.log("process", process);

        if (!process?.status || process.status === "FAILED") {
            throw new Error("Transaction failed");
        }

        return {
            hash: process.txHash as `0x${string}`,
            from: fromAddress,
            to: routes.routes[0].steps[0].estimate
                .approvalAddress as `0x${string}`,
            value: 0n,
            data: process.data as `0x${string}`,
            chainId: this.walletProvider.getChainConfigs(params.chain).id,
        };
    }
    // Simplified example function to execute each step of the route sequentially
    async executeRouteSteps(route: Route): Promise<Transaction> {
        let transactionHash: Address = "0x0";
        let isExecute = false
        console.log("number of steps", route.steps.length)
        for (const stepInitial of route.steps) {
            // Request transaction data for the current step
            const step = await getStepTransaction(stepInitial);

            // console.log('Estimativa:', step.estimate);

            if (step.estimate.gasCosts?.[0].amountUSD) {
                const gasUSD = parseFloat(step.estimate.gasCosts[0].amountUSD);
                if (gasUSD > 1.05) {
                    throw new Error(`Gas cost too high: $${gasUSD}`);
                }
            }
            isExecute = true;
            // Send the transaction (e.g. using Viem)
            let status = 'FAILED';

            if (isExecute) {
                // console.log("step transactionRequest", step.transactionRequest)
                transactionHash = await this.walletClient.sendTransaction(step.transactionRequest as SendTransactionParameters);

                // Monitor the status of the transaction
                do {
                    const result = await getStatus({
                        txHash: transactionHash,
                        fromChain: step.action.fromChainId,
                        toChain: step.action.toChainId,
                        bridge: step.tool,
                    })
                    status = result.status

                    console.log(`Transaction status for ${transactionHash}:`, status);

                    // Wait for a short period before checking the status again
                    await new Promise(resolve => setTimeout(resolve, 5000));

                } while (status !== 'DONE' && status !== 'FAILED');
            }

            if (status === 'FAILED') {
                console.error(`Transaction ${transactionHash} failed`);
                return;
            }
        }

        console.log('All steps executed successfully');
        return {
            hash: transactionHash,
            from: route.fromAddress as Address,
            to: route.steps[0].estimate
                .approvalAddress as Address,
            value: 0n,
            data: route.steps[0].transactionRequest.data as Hex,
            chainId: route.fromChainId,
        };
    }
}

export const swapAction = {
    name: "swap",
    description: "Swap tokens on the same chain",
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: any,
        callback?: any
    ) => {
        console.log("Swap action handler called");
        const walletProvider = await initWalletProvider(runtime);



        const action = new SwapAction(walletProvider);
        // state = await runtime.composeState(_message)
        // console.log("state", state)

        const walletInfo = await evmWalletProvider.get(runtime, _message, state);
        state.walletInfo = walletInfo;

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(_message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }
        // Compose swap context
        const swapContext = composeContext({
            state,
            template: swapTemplate,
        });
        console.log("swapContext", swapContext)
        // throw new Error("teste")

        const content = await generateObjectDeprecated({
            runtime,
            context: swapContext,
            modelClass: ModelClass.LARGE,
        });

        const swapOptions: SwapParams = {
            chain: content.chain,
            fromToken: content.inputToken,
            toToken: content.outputToken,
            amount: content.amount,
            slippage: content.slippage,
        };

        try {
            const swapResp = await action.swap(swapOptions);
            if (callback) {
                callback({
                    text: `Successfully swap ${swapOptions.amount} ${swapOptions.fromToken} tokens to ${swapOptions.toToken}\nTransaction Hash: ${swapResp.hash}`,
                    content: {
                        success: true,
                        hash: swapResp.hash,
                        recipient: swapResp.to,
                        chain: content.chain,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error in swap handler:", error.message);
            if (callback) {
                callback({ text: `Error: ${error.message}` });
            }
            return false;
        }
    },
    template: swapTemplate,
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Swap 1 ETH for USDC on Base",
                    action: "TOKEN_SWAP",
                },
            },
        ],
    ],
    similes: ["TOKEN_SWAP", "EXCHANGE_TOKENS", "TRADE_TOKENS"],
}; // TODO: add more examples
