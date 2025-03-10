import type { Content, HandlerCallback, IAgentRuntime, Memory, State } from "@elizaos/core";
import { composeContext, elizaLogger, generateObjectDeprecated, ModelClass, stringToUuid } from "@elizaos/core";
import { getTokens, getTokenBalances, getTokenBalance, getToken } from "@lifi/sdk";
import { evmWalletProvider, initWalletProvider, WalletProvider } from "../providers/wallet.js";
import type { SupportedChain, TokenWithBalance } from "../types/index.js";
import { formatEther, formatUnits, Hex, hexToBigInt, parseEther } from "viem";
elizaLogger.verbose = true
// Balance action template
export const balanceTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested balance query:
- Chain to check balance
- Specific token to check, use the token address as format 0x...
- Wallet address (optional)

Respond with a JSON markdown block containing only the extracted values:

\`\`\`json
{
    "chain": "ethereum" | "base" | "arbitrum" | /* other supported chains */ | null,
    "address": string | null,
    "token": string | null
}
\`\`\`
`;

export class BalanceAction {
    constructor(private walletProvider: WalletProvider) { }

    async getBalances({ chain, tokenAddress, address }: { chain: SupportedChain, tokenAddress: string, address?: string }): Promise<TokenWithBalance> {
        try {
            // Get wallet address if not provided
            if (!address) {
                const walletClient = this.walletProvider.getWalletClient(chain);
                [address] = await walletClient.getAddresses();
            }

            // Get chain configuration
            const chainConfig = this.walletProvider.getChainConfigs(chain);
            // console.log('chainConfig', chainConfig)
            // If a specific token was requested
            console.log('tokenAddress', tokenAddress)
            const token = await getToken(chainConfig.id, tokenAddress);
            if (!token) {
                throw new Error(`Token not found on ${chainConfig.id} chain`);
            }
            console.log('token', token)
            // const tokenBalances = await getTokenBalance(address, token);
            const tokenBalance = await this.walletProvider.getTokenBalance(token.address) as Hex;

            console.log('tokenBalance', tokenBalance) //0x0000000000000000000000000000000000000000000000000000000000032f3d
            // Converter o balance hexadecimal para BigInt usando viem
            const balanceInWei = hexToBigInt(tokenBalance);
            const formattedBalance = formatUnits(balanceInWei, token.decimals);
            console.log('formattedBalance', formattedBalance)
            return {
                symbol: token.symbol,
                balance: balanceInWei.toString(),
                formattedBalance: formattedBalance,
                priceUSD: token.priceUSD || "0",
                valueUSD: (parseFloat(token.priceUSD || "0") * parseFloat(formattedBalance)).toString()
            };
        } catch (error) {
            elizaLogger.error("Error getting balances:", error);
            throw new Error(`Failed to get balances: ${error.message}`);
        }
    }
}

export const balanceAction = {
    name: "balance",
    description: "Check token balances on a specific blockchain",

    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        console.log("Balance action handler called");
        const walletProvider = await initWalletProvider(runtime);
        const action = new BalanceAction(walletProvider);

        const walletInfo = await evmWalletProvider.get(runtime, _message, state);
        state.walletInfo = walletInfo;

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(_message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Compose balance context
        const balanceContext = composeContext({
            state,
            template: balanceTemplate
        });

        // console.log('balanceContext', balanceContext)

        const content = await generateObjectDeprecated({
            runtime,
            context: balanceContext,
            modelClass: ModelClass.LARGE,
        });

        // console.log('content', content)

        try {
            const balances = await action.getBalances({
                chain: content.chain,
                tokenAddress: content.token,
                address: content.address
            });

            if (callback) {
                // Format response for user
                const balanceText = `${balances.symbol}: ${balances.formattedBalance} (USD $${balances.valueUSD})`;

                const callbackResponse = {
                    text: `Balances found on ${content.chain} chain:\n${balanceText}`,
                    content: {
                        success: true,
                        balances: balances,
                        chain: content.chain,
                    },
                } as Content;
                let memory = {
                    id: stringToUuid(callbackResponse.text),
                    createdAt: Date.now(),
                    content: { text: callbackResponse.text },
                    userId: _message.userId,
                    agentId: _message.agentId,
                    roomId: _message.roomId
                } as Memory;

                memory = await runtime.messageManager.addEmbeddingToMemory(memory)
                await runtime.messageManager.createMemory(memory);
                callback(callbackResponse);
            }
            return true;
        } catch (error) {
            console.error("Error in balance handler:", error.message);
            if (callback) {
                callback({ text: `Error: ${error.message}` });
            }
            return false;
        }
    },
    template: balanceTemplate,
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Show my balances on Base",
                    action: "CHECK_BALANCE",
                },
            },
            {
                user: "user",
                content: {
                    text: "How much i have in USDC on Base?",
                    action: "GET_BALANCES",
                },
            },
            {
                user: "user",
                content: {
                    text: "What is the balance for the token 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 on Base?",
                    action: "GET_BALANCES",
                },
            },
        ],
    ],
    similes: ["CHECK_BALANCE", "GET_BALANCES", "SHOW_TOKENS"],
}; 