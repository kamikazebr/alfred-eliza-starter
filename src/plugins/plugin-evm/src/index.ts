import type { Plugin } from "@elizaos/core";
import { swapAction } from "./actions/swap.js";
import { balanceAction } from "./actions/balance.js";
import { evmWalletProvider } from "./providers/wallet.js";

const evmPlugin: Plugin = {
    name: "evm",
    description: "EVM blockchain integration plugin",
    providers: [evmWalletProvider],
    evaluators: [],
    services: [],
    actions: [swapAction, balanceAction],
};

export { evmPlugin };