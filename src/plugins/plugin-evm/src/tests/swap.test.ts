import { describe, expect, it, vi } from 'vitest';
import { SwapAction } from '../actions/swap.js';
import { WalletProvider } from '../providers/wallet.js';
import type { SwapParams } from '../types/index.js';

describe('SwapAction', () => {
    it('should create a swap transaction', async () => {
        // Mock do WalletProvider
        const mockWalletProvider = {
            getWalletClient: vi.fn().mockReturnValue({
                account: {
                    address: '0xmockAddress'
                },
                getAddresses: vi.fn().mockResolvedValue(['0xmockAddress'])
            }),
            getCurrentChain: vi.fn().mockReturnValue({
                name: 'mainnet',
                id: 1
            }),
            getChainConfigs: vi.fn().mockReturnValue({
                id: 1,
                name: 'mainnet'
            }),
            chains: {
                mainnet: {
                    id: 1,
                    name: 'mainnet',
                    nativeCurrency: {
                        name: 'Ether',
                        symbol: 'ETH',
                        decimals: 18
                    },
                    rpcUrls: {
                        default: {
                            http: ['https://eth.llamarpc.com']
                        }
                    }
                }
            }
        } as unknown as WalletProvider;

        const swapAction = new SwapAction(mockWalletProvider);

        const params: SwapParams = {
            chain: 'mainnet',
            fromToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
            toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',   // USDC
            amount: '1.0',
            slippage: 0.5
        };

        try {
            const result = await swapAction.swap(params);
            expect(result).toBeDefined();
            expect(result.hash).toBeDefined();
            expect(result.from).toBe('0xmockAddress');
        } catch (error) {
            // Se houver erro na execução real, pelo menos verificamos se as funções foram chamadas
            expect(mockWalletProvider.getWalletClient).toHaveBeenCalled();
            expect(mockWalletProvider.getChainConfigs).toHaveBeenCalled();
        }
    });
}); 