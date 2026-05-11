import { parseUnits, formatUnits, encodeFunctionData, type Address } from 'viem';
import { execSafeBatch, parseReceivedAmount } from './safe';
import { CONTRACTS, POOL_FEES, SWAP_ROUTER_ABI, ERC20_ABI } from './constants';

const USDC_DECIMALS  = 6;
const WETH_DECIMALS  = 18;
const cbBTC_DECIMALS = 8;

type Asset = 'ETH' | 'BTC';

function tokenFor(asset: Asset): Address {
  return asset === 'ETH' ? CONTRACTS.WETH : CONTRACTS.cbBTC;
}
function decimalsFor(asset: Asset): number {
  return asset === 'ETH' ? WETH_DECIMALS : cbBTC_DECIMALS;
}
function feeFor(asset: Asset): number {
  return asset === 'ETH' ? POOL_FEES.USDC_WETH : POOL_FEES.USDC_cbBTC;
}

function buildApproveAndSwapUsdc(
  usdcAmount: number,
  asset: Asset,
  recipient: Address,
): Parameters<typeof execSafeBatch>[1] {
  const amountIn = parseUnits(usdcAmount.toFixed(6), USDC_DECIMALS);
  const tokenOut = tokenFor(asset);
  const fee      = feeFor(asset);
  return [
    {
      to:   CONTRACTS.USDC,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.SWAP_ROUTER, amountIn],
      }),
    },
    {
      to:   CONTRACTS.SWAP_ROUTER,
      data: encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: CONTRACTS.USDC,
          tokenOut,
          fee,
          recipient,
          amountIn,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
      }),
    },
  ];
}

type InnerTxs = Parameters<typeof execSafeBatch>[1];

export async function swapUsdcForAsset(
  usdcAmount: number,
  asset: Asset,
  safeAddress: Address,
  privateKey: `0x${string}`,
  rpcUrl: string,
): Promise<{ txHash: string; assetAmount: number }> {
  const txs = buildApproveAndSwapUsdc(usdcAmount, asset, safeAddress);

  const receipt = await execSafeBatch(safeAddress, txs, privateKey, rpcUrl);

  const tokenOut    = tokenFor(asset);
  const received    = parseReceivedAmount(receipt, tokenOut, safeAddress);
  const assetAmount = parseFloat(formatUnits(received, decimalsFor(asset)));
  return { txHash: receipt.transactionHash, assetAmount };
}

/**
 * Both daily buys in **one** Safe transaction (MultiSend: approve+swap USDC→WETH,
 * then approve+swap USDC→cbBTC). Avoids a second signer tx / Safe nonce round-trip
 * that was causing the second leg to fail while the first succeeded.
 */
export async function swapUsdcForEthAndBtcPair(
  usdcEth: number,
  usdcBtc: number,
  safeAddress: Address,
  privateKey: `0x${string}`,
  rpcUrl: string,
): Promise<{ txHash: string; ethAssetAmount: number; btcAssetAmount: number }> {
  const txs: InnerTxs = [
    ...buildApproveAndSwapUsdc(usdcEth, 'ETH', safeAddress),
    ...buildApproveAndSwapUsdc(usdcBtc, 'BTC', safeAddress),
  ];

  const receipt = await execSafeBatch(safeAddress, txs, privateKey, rpcUrl);

  const ethReceived = parseReceivedAmount(receipt, CONTRACTS.WETH,  safeAddress);
  const btcReceived = parseReceivedAmount(receipt, CONTRACTS.cbBTC, safeAddress);

  return {
    txHash: receipt.transactionHash,
    ethAssetAmount: parseFloat(formatUnits(ethReceived, WETH_DECIMALS)),
    btcAssetAmount: parseFloat(formatUnits(btcReceived, cbBTC_DECIMALS)),
  };
}

export async function swapAssetForUsdc(
  assetAmount: number,
  asset: Asset,
  safeAddress: Address,
  privateKey: `0x${string}`,
  rpcUrl: string,
): Promise<{ txHash: string; usdcReceived: number }> {
  const tokenIn  = tokenFor(asset);
  const decimals = decimalsFor(asset);
  const amountIn = parseUnits(assetAmount.toFixed(decimals), decimals);
  const fee      = feeFor(asset);

  const receipt = await execSafeBatch(
    safeAddress,
    [
      {
        to:   tokenIn,
        data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACTS.SWAP_ROUTER, amountIn] }),
      },
      {
        to:   CONTRACTS.SWAP_ROUTER,
        data: encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{ tokenIn, tokenOut: CONTRACTS.USDC, fee, recipient: safeAddress, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
        }),
      },
    ],
    privateKey,
    rpcUrl,
  );

  const received    = parseReceivedAmount(receipt, CONTRACTS.USDC, safeAddress);
  const usdcReceived = parseFloat(formatUnits(received, USDC_DECIMALS));
  return { txHash: receipt.transactionHash, usdcReceived };
}
