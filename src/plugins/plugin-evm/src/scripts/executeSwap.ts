import { initWalletProvider } from '../providers/wallet.js';
import { SwapAction } from '../actions/swap.js';
import type { SwapParams } from '../types/index.js';
import { AgentRuntime, elizaLogger } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import { Character, ModelProviderName } from "@elizaos/core";
import { initializeDatabase } from '../../../../database/index.js';
import path from 'path';
import fs from 'fs';
// Tokens comuns
const TOKENS = {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    VEIL: '0x767a739d1a152639e9ea1d8c1bd55fdc5b217d7f'
} as const;

async function executeSwap() {
    try {
        const dataDir = path.join("data");

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const db = initializeDatabase(dataDir);

        await db.init();

        let agentRuntime = new AgentRuntime({
            databaseAdapter: db,
            token: 'token-123',
            modelProvider: ModelProviderName.OPENAI,
            evaluators: [],
            character: {
                name: "Swap Bot",
                modelProvider: ModelProviderName.OPENAI,
                bio: "A bot that executes swaps",
                lore: ["A bot that executes swaps"],
                settings: {
                    chains: {
                        evm: ['base']
                    }
                },
                messageExamples: [],
                postExamples: [],
                topics: [],
                adjectives: [],
                instructions: "",
                constraints: "",
                voice: "",
                username: "SwapBot",
                id: "swap-bot-1-2-3",
                clients: [],
                plugins: [],
                style: {
                    all: [],
                    chat: [],
                    post: []
                },
            } as Character,
            plugins: [],
            providers: [],
            actions: [],
            services: [],
            managers: [],
            cacheManager: null,
        });

        // Inicializa o WalletProvider
        const walletProvider = await initWalletProvider(agentRuntime);

        console.log(walletProvider);

        // Cria instância do SwapAction
        const swapAction = new SwapAction(walletProvider);

        // Parâmetros do swap
        const swapParams: SwapParams = {
            chain: 'base',
            fromToken: TOKENS.VEIL,
            toToken: TOKENS.USDC,
            amount: '0.66806077', // 0.66806077 VEIL
            slippage: 0.5  // 0.5% slippage
        };

        // Executa o swap
        console.log('Iniciando swap...');
        console.log('Parâmetros:', swapParams);

        const result = await swapAction.swap(swapParams);

        console.log('Swap concluído com sucesso!');
        console.log('Hash da transação:', result.hash);
        console.log('De:', result.from);

    } catch (error) {
        console.error('Erro ao executar swap:', error);
        process.exit(1);
    }
}

// Verifica se as variáveis de ambiente necessárias estão definidas
if (!process.env.EVM_PRIVATE_KEY || !process.env.ETHEREUM_PROVIDER_BASE) {
    console.error('As variáveis de ambiente EVM_PRIVATE_KEY e ETHEREUM_PROVIDER_BASE são necessárias');
    process.exit(1);
}

// Executa o script
executeSwap(); 