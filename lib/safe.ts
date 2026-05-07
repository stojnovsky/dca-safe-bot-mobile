import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  decodeEventLog,
  type Address,
  type Hex,
  type TransactionReceipt,
  zeroAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  SAFE_ABI,
  MULTISEND_ABI,
  MULTISEND_ADDRESS,
  ERC20_TRANSFER_ABI,
} from './constants';

export type SafeTx = { to: Address; data: Hex; value?: bigint };

// ── MultiSend encoding ─────────────────────────────────────────────────────────
// Format per tx: [operation:1][to:20][value:32][dataLen:32][data:n]
function encodeMultiSend(txs: SafeTx[]): Hex {
  let hex = '';
  for (const tx of txs) {
    const data    = (tx.data ?? '0x') as string;
    const dataHex = data.startsWith('0x') ? data.slice(2) : data;
    const dataLen = dataHex.length / 2;
    hex +=
      '00' +
      tx.to.toLowerCase().replace('0x', '').padStart(40, '0') +
      (tx.value ?? 0n).toString(16).padStart(64, '0') +
      dataLen.toString(16).padStart(64, '0') +
      dataHex;
  }
  return `0x${hex}` as Hex;
}

// ── Public client cache ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _cache = new Map<string, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPublicClient(rpcUrl: string): any {
  if (!_cache.has(rpcUrl)) {
    _cache.set(rpcUrl, createPublicClient({ chain: base, transport: http(rpcUrl) }));
  }
  return _cache.get(rpcUrl);
}

// ── Execute a batch of Safe transactions ──────────────────────────────────────
export async function execSafeBatch(
  safeAddress: Address,
  txs: SafeTx[],
  privateKey: Hex,
  rpcUrl: string,
): Promise<TransactionReceipt> {
  const account      = privateKeyToAccount(privateKey);
  const publicClient = getPublicClient(rpcUrl);

  const to:        Address = txs.length === 1 ? txs[0].to    : MULTISEND_ADDRESS;
  const value:     bigint  = txs.length === 1 ? (txs[0].value ?? 0n) : 0n;
  const data:      Hex     = txs.length === 1
    ? txs[0].data
    : encodeFunctionData({ abi: MULTISEND_ABI, functionName: 'multiSend', args: [encodeMultiSend(txs)] });
  const operation: number  = txs.length === 1 ? 0 : 1; // CALL or DELEGATECALL

  const nonce = await publicClient.readContract({
    address:      safeAddress,
    abi:          SAFE_ABI,
    functionName: 'nonce',
  }) as bigint;

  const signature = await account.signTypedData({
    domain: { chainId: BASE_CHAIN_ID, verifyingContract: safeAddress },
    types: {
      SafeTx: [
        { name: 'to',             type: 'address' },
        { name: 'value',          type: 'uint256' },
        { name: 'data',           type: 'bytes'   },
        { name: 'operation',      type: 'uint8'   },
        { name: 'safeTxGas',      type: 'uint256' },
        { name: 'baseGas',        type: 'uint256' },
        { name: 'gasPrice',       type: 'uint256' },
        { name: 'gasToken',       type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce',          type: 'uint256' },
      ],
    },
    primaryType: 'SafeTx',
    message: {
      to, value, data, operation,
      safeTxGas: 0n, baseGas: 0n, gasPrice: 0n,
      gasToken: zeroAddress, refundReceiver: zeroAddress,
      nonce,
    },
  });

  // Encode execTransaction call and send via sendTransaction (avoids chain type constraints of writeContract)
  const callData = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: 'execTransaction',
    args: [to, value, data, operation, 0n, 0n, 0n, zeroAddress, zeroAddress, signature],
  });

  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
  const hash = await walletClient.sendTransaction({ to: safeAddress, data: callData, value: 0n });

  return publicClient.waitForTransactionReceipt({ hash });
}

// ── Parse Transfer events from receipt ────────────────────────────────────────
export function parseReceivedAmount(
  receipt: TransactionReceipt,
  token: Address,
  recipient: Address,
): bigint {
  let total = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: ERC20_TRANSFER_ABI, data: log.data, topics: log.topics });
      const args = decoded.args as { to: string; value: bigint };
      if (args.to.toLowerCase() === recipient.toLowerCase()) total += args.value;
    } catch { /* not a Transfer */ }
  }
  return total;
}

const BASE_CHAIN_ID = 8453;
