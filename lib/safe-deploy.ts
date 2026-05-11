import {
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  formatUnits,
  getContractAddress,
  http,
  keccak256,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { getPublicClient } from './safe';
import {
  CONTRACTS,
  ERC20_ABI,
  SAFE_FALLBACK_HANDLER,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_PROXY_FACTORY_ABI,
  SAFE_SETUP_ABI,
} from './constants';

export interface Signer {
  privateKey: Hex;
  address:    Address;
}

/**
 * Generate a fresh random EOA. Returned data lives only in memory until the
 * caller persists it (typically via savePrivateKey).
 */
export function generateSigner(): Signer {
  const privateKey = generatePrivateKey();
  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

/**
 * Build the calldata for Safe.setup() that creates a 1-of-1 Safe owned by `owner`.
 */
function buildSetupData(owner: Address): Hex {
  return encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: 'setup',
    args: [
      [owner],
      1n,
      zeroAddress,
      '0x' as Hex,
      SAFE_FALLBACK_HANDLER,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
}

/**
 * Predict the CREATE2 address of the Safe that *would* be deployed for the
 * given signer and saltNonce. This lets us show the address to the user and
 * accept USDC deposits **before** the Safe is actually deployed — Safe Wallet
 * calls this a "counterfactual" Safe.
 */
export async function predictSafeAddress(
  signerAddress: Address,
  saltNonce: bigint,
  rpcUrl: string,
): Promise<Address> {
  const client = getPublicClient(rpcUrl);

  const proxyCreationCode = (await client.readContract({
    address:      SAFE_PROXY_FACTORY,
    abi:          SAFE_PROXY_FACTORY_ABI,
    functionName: 'proxyCreationCode',
  })) as Hex;

  const setupData = buildSetupData(signerAddress);

  const bytecode = (proxyCreationCode +
    encodeAbiParameters([{ type: 'uint256' }], [BigInt(SAFE_L2_SINGLETON)]).slice(2)
  ) as Hex;

  const salt = keccak256(
    encodePacked(['bytes32', 'uint256'], [keccak256(setupData), saltNonce]),
  );

  return getContractAddress({
    bytecode,
    from:   SAFE_PROXY_FACTORY,
    opcode: 'CREATE2',
    salt,
  });
}

/**
 * Deploy the Safe through SafeProxyFactory.createProxyWithNonce, signed and
 * paid for by the freshly-generated signer (which is also the Safe owner).
 * Returns the on-chain proxy address parsed out of the ProxyCreation event.
 */
export async function deploySafe(
  signerPrivateKey: Hex,
  saltNonce: bigint,
  rpcUrl: string,
): Promise<{ safeAddress: Address; txHash: Hex }> {
  const account      = privateKeyToAccount(signerPrivateKey);
  const publicClient = getPublicClient(rpcUrl);
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  const setupData = buildSetupData(account.address);

  const callData = encodeFunctionData({
    abi:          SAFE_PROXY_FACTORY_ABI,
    functionName: 'createProxyWithNonce',
    args:         [SAFE_L2_SINGLETON, setupData, saltNonce],
  });

  const txHash = await walletClient.sendTransaction({
    to:    SAFE_PROXY_FACTORY,
    data:  callData,
    value: 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error('Safe deployment reverted');

  const logs = parseEventLogs({
    abi:    SAFE_PROXY_FACTORY_ABI,
    eventName: 'ProxyCreation',
    logs:   receipt.logs,
  });

  const created = logs.find((l) => l.address.toLowerCase() === SAFE_PROXY_FACTORY.toLowerCase());
  const safeAddress = created?.args.proxy as Address | undefined;

  if (!safeAddress) {
    // Fallback: try decoding all logs from the factory (older Safe forks emit at the proxy address)
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: SAFE_PROXY_FACTORY_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === 'ProxyCreation') {
          return { safeAddress: (decoded.args as { proxy: Address }).proxy, txHash };
        }
      } catch { /* not our event */ }
    }
    throw new Error('Could not extract Safe address from deployment receipt');
  }

  return { safeAddress, txHash };
}

/** Native ETH balance in wei. */
export async function getEthBalance(address: Address, rpcUrl: string): Promise<bigint> {
  const client = getPublicClient(rpcUrl);
  return client.getBalance({ address });
}

/** USDC balance in 6-decimal smallest units. Treats reverts (non-deployed addr) as 0. */
export async function getUsdcBalance(address: Address, rpcUrl: string): Promise<bigint> {
  const client = getPublicClient(rpcUrl);
  try {
    const raw = await client.readContract({
      address:      CONTRACTS.USDC,
      abi:          ERC20_ABI,
      functionName: 'balanceOf',
      args:         [address],
    });
    return raw as bigint;
  } catch {
    return 0n;
  }
}

export function formatEth(wei: bigint, dp = 4): string {
  return Number(formatUnits(wei, 18)).toFixed(dp);
}

export function formatUsdc(units: bigint, dp = 2): string {
  return Number(formatUnits(units, 6)).toFixed(dp);
}
