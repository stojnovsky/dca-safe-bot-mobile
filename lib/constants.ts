import type { Address } from 'viem';

export const BASE_CHAIN_ID = 8453;
export const HISTORY_START = '2022-01-01';
export const PRICE_API_URL = 'https://cena.ambire.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd';
export const CG_PRO_BASE   = 'https://pro-api.coingecko.com/api/v3';
export const CG_DEMO_BASE  = 'https://api.coingecko.com/api/v3';
export const DEFAULT_RPC   = 'https://base.llamarpc.com';
// Safe canonical MultiSend v1.3.0 on Base
export const MULTISEND_ADDRESS: Address = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';

export const CONTRACTS = {
  USDC:        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  WETH:        '0x4200000000000000000000000000000000000006' as Address,
  cbBTC:       '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address,
  SWAP_ROUTER: '0x2626664c2603336E57B271c5C0b26F421741e481' as Address,
} as const;

export const POOL_FEES = {
  USDC_WETH:  500,
  USDC_cbBTC: 500,
} as const;

export const SWAP_ROUTER_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{
      name: 'params', type: 'tuple',
      components: [
        { name: 'tokenIn',           type: 'address' },
        { name: 'tokenOut',          type: 'address' },
        { name: 'fee',               type: 'uint24'  },
        { name: 'recipient',         type: 'address' },
        { name: 'amountIn',          type: 'uint256' },
        { name: 'amountOutMinimum',  type: 'uint256' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const SAFE_ABI = [
  {
    name: 'nonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getOwners',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'getThreshold',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'execTransaction',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'to',             type: 'address' },
      { name: 'value',          type: 'uint256' },
      { name: 'data',           type: 'bytes'   },
      { name: 'operation',      type: 'uint8'   },
      { name: 'safeTxGas',      type: 'uint256' },
      { name: 'baseGas',        type: 'uint256' },
      { name: 'gasPrice',       type: 'uint256' },
      { name: 'gasToken',       type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures',     type: 'bytes'   },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const;

export const MULTISEND_ABI = [
  {
    name: 'multiSend',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
  },
] as const;

export const ERC20_TRANSFER_ABI = [
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from',  type: 'address', indexed: true  },
      { name: 'to',    type: 'address', indexed: true  },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;
