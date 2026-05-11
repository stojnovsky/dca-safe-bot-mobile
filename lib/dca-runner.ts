import { formatUnits } from 'viem';
import { getPublicClient } from './safe';
import { swapUsdcForAsset, swapUsdcForEthAndBtcPair, swapAssetForUsdc } from './swap';
import {
  createPosition, closePosition,
  createUsdcPosition, getOpenPositions, hasPositionForDate,
} from './position-store';
import { CONTRACTS, ERC20_ABI, PRICE_API_URL } from './constants';
import type { BotConfig } from './types';

const USDC_DECIMALS = 6;

async function getLivePrices(): Promise<{ eth: number; btc: number }> {
  const res  = await fetch(PRICE_API_URL);
  const json = await res.json();
  return { eth: json.ethereum.usd, btc: json.bitcoin.usd };
}

async function getSafeUsdcBalance(safeAddress: `0x${string}`, rpcUrl: string): Promise<number> {
  const client = getPublicClient(rpcUrl);
  const raw    = await client.readContract({
    address:      CONTRACTS.USDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [safeAddress],
  });
  return parseFloat(formatUnits(raw as bigint, USDC_DECIMALS));
}

export interface RunResult {
  date:   string;
  buys:   { asset: 'ETH' | 'BTC'; txHash: string; assetAmount: number; price: number }[];
  sells:  { asset: 'ETH' | 'BTC'; txHash: string; usdcReceived: number; profitPct: number }[];
  errors: string[];
}

export async function runDailyDca(config: BotConfig, privateKey: `0x${string}`): Promise<RunResult> {
  const today   = new Date().toISOString().slice(0, 10);
  const result: RunResult = { date: today, buys: [], sells: [], errors: [] };

  const safeAddress = config.safeAddress as `0x${string}`;
  const { eth: ethPrice, btc: btcPrice } = await getLivePrices();

  // ── 1. SELL positions above profit threshold ─────────────────────────────
  const openPositions = await getOpenPositions();
  for (const pos of openPositions) {
    const currentPrice = pos.asset === 'ETH' ? ethPrice : btcPrice;
    const pnlPct = ((currentPrice - pos.buyPrice) / pos.buyPrice) * 100;
    if (pnlPct < config.profitThreshold) continue;

    try {
      const { txHash, usdcReceived } = await swapAssetForUsdc(
        pos.assetAmount, pos.asset, safeAddress, privateKey, config.rpcUrl,
      );
      await closePosition(pos.id, {
        sellDate:     today,
        sellPrice:    currentPrice,
        usdcReceived,
        sellTxHash:   txHash,
        profitUsd:    usdcReceived - pos.usdcInvested,
        profitPct:    pnlPct,
      });
      await createUsdcPosition({
        sourceAsset:      pos.asset,
        sourcePositionId: pos.id,
        createDate:       today,
        sellPrice:        currentPrice,
        usdcAmount:       usdcReceived,
      });
      result.sells.push({ asset: pos.asset, txHash, usdcReceived, profitPct: pnlPct });
    } catch (e) {
      result.errors.push(`sell ${pos.asset} ${pos.id}: ${e}`);
    }
  }

  // ── 2. DAILY BUY ─────────────────────────────────────────────────────────
  const totalNeeded = config.dailyAmountEth + config.dailyAmountBtc;
  const usdcInSafe  = await getSafeUsdcBalance(safeAddress, config.rpcUrl);

  if (usdcInSafe < totalNeeded) {
    result.errors.push(
      `Insufficient USDC in Safe: have $${usdcInSafe.toFixed(2)}, need $${totalNeeded.toFixed(2)}`,
    );
    return result;
  }

  const needEth = !(await hasPositionForDate('ETH', today));
  const needBtc = !(await hasPositionForDate('BTC', today));

  if (!needEth) result.errors.push('Already bought ETH today, skipping');
  if (!needBtc) result.errors.push('Already bought BTC today, skipping');

  // Both legs in one Safe MultiSend + one signer tx — sequential Safe txs often caused the 2nd leg to fail (nonce / RPC timing).
  if (needEth && needBtc) {
    try {
      const { txHash, ethAssetAmount, btcAssetAmount } = await swapUsdcForEthAndBtcPair(
        config.dailyAmountEth,
        config.dailyAmountBtc,
        safeAddress,
        privateKey,
        config.rpcUrl,
      );
      await createPosition({
        asset:        'ETH',
        buyDate:      today,
        buyPrice:     ethPrice,
        usdcInvested: config.dailyAmountEth,
        assetAmount:  ethAssetAmount,
        buyTxHash:    txHash,
      });
      await createPosition({
        asset:        'BTC',
        buyDate:      today,
        buyPrice:     btcPrice,
        usdcInvested: config.dailyAmountBtc,
        assetAmount:  btcAssetAmount,
        buyTxHash:    txHash,
      });
      result.buys.push({ asset: 'ETH', txHash, assetAmount: ethAssetAmount, price: ethPrice });
      result.buys.push({ asset: 'BTC', txHash, assetAmount: btcAssetAmount, price: btcPrice });
    } catch (e) {
      result.errors.push(`buy ETH+BTC: ${e}`);
    }
  } else {
    for (const asset of ['ETH', 'BTC'] as const) {
      const want = asset === 'ETH' ? needEth : needBtc;
      if (!want) continue;

      const amount = asset === 'ETH' ? config.dailyAmountEth : config.dailyAmountBtc;
      const price  = asset === 'ETH' ? ethPrice : btcPrice;

      try {
        const { txHash, assetAmount } = await swapUsdcForAsset(
          amount, asset, safeAddress, privateKey, config.rpcUrl,
        );
        await createPosition({
          asset,
          buyDate:      today,
          buyPrice:     price,
          usdcInvested: amount,
          assetAmount,
          buyTxHash:    txHash,
        });
        result.buys.push({ asset, txHash, assetAmount, price });
      } catch (e) {
        result.errors.push(`buy ${asset}: ${e}`);
      }
    }
  }

  return result;
}
