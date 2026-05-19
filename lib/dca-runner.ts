import { formatUnits } from 'viem';
import { getPublicClient } from './safe';
import { swapUsdcForAsset, swapUsdcForEthAndBtcPair, swapAssetForUsdc } from './swap';
import {
  createPosition, closePosition, reopenPosition,
  createUsdcPosition, getOpenPositions, hasPositionForDate,
  getClosedPositionsForReopen, getPositionById,
} from './position-store';
import { CONTRACTS, ERC20_ABI, PRICE_API_URL } from './constants';
import type { BotConfig } from './types';
import { localCalendarDate } from './calendar-day';
import { reopenDownPctFor, stopLossPctFor, takeProfitPct } from './strategy-thresholds';

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
  const today   = localCalendarDate();
  const result: RunResult = { date: today, buys: [], sells: [], errors: [] };

  const safeAddress = config.safeAddress as `0x${string}`;
  const { eth: ethPrice, btc: btcPrice } = await getLivePrices();

  // ── 1. SELL: take-profit first, else optional stop-loss (same pass) ───────
  const openPositions = await getOpenPositions();
  const slOn = config.stopLossEnabled === true;

  for (const pos of openPositions) {
    const currentPrice = pos.asset === 'ETH' ? ethPrice : btcPrice;
    const pnlPct = ((currentPrice - pos.buyPrice) / pos.buyPrice) * 100;
    const pt = takeProfitPct(config, pos.asset);
    const takeProfit = pnlPct >= pt;
    const slPct = stopLossPctFor(config, pos.asset);
    const stopLoss = slOn && slPct > 0 && pnlPct <= -slPct;
    if (!takeProfit && !stopLoss) continue;

    const closeReason = takeProfit ? 'take_profit' : 'stop_loss';

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
        closeReason,
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

  // ── 1b. Reopen closed rows when price is down (per-asset %) from last exit ─
  if (config.reopenEnabled === true) {
    const candidates = await getClosedPositionsForReopen();
    for (const pos of candidates) {
      const latest = await getPositionById(pos.id);
      if (!latest || latest.status !== 'CLOSED' || latest.sellPrice == null || latest.usdcReceived == null) continue;

      const currentPrice = latest.asset === 'ETH' ? ethPrice : btcPrice;
      const rdp = reopenDownPctFor(config, latest.asset);
      if (rdp <= 0) continue;
      if (currentPrice > latest.sellPrice * (1 - rdp / 100)) continue;

      const usdc = latest.usdcReceived;
      if (usdc < 1) continue;

      try {
        const { txHash, assetAmount } = await swapUsdcForAsset(
          usdc, latest.asset, safeAddress, privateKey, config.rpcUrl,
        );
        await reopenPosition(latest.id, {
          buyDate:      today,
          buyPrice:     currentPrice,
          usdcInvested: usdc,
          assetAmount,
          buyTxHash:    txHash,
        });
        result.buys.push({ asset: latest.asset, txHash, assetAmount, price: currentPrice });
      } catch (e) {
        result.errors.push(`reopen ${latest.asset} ${latest.id}: ${e}`);
      }
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

/**
 * Manually close a single **OPEN** position at current spot (same swap path as the bot).
 * Records take-profit if PnL ≥ 0 at exit, otherwise stop-loss, for coin coloring.
 */
export async function closeOpenPositionNow(
  config: BotConfig,
  privateKey: `0x${string}`,
  positionId: string,
): Promise<{ ok: true; txHash: string } | { ok: false; error: string }> {
  const pos = await getPositionById(positionId);
  if (!pos) return { ok: false, error: 'Position not found' };
  if (pos.status !== 'OPEN') return { ok: false, error: 'Position is not open' };

  const safeAddress = config.safeAddress as `0x${string}`;
  const { eth: ethPrice, btc: btcPrice } = await getLivePrices();
  const currentPrice = pos.asset === 'ETH' ? ethPrice : btcPrice;
  const pnlPct = ((currentPrice - pos.buyPrice) / pos.buyPrice) * 100;
  const closeReason = pnlPct >= 0 ? 'take_profit' : 'stop_loss';
  const today = localCalendarDate();

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
      closeReason,
    });
    await createUsdcPosition({
      sourceAsset:      pos.asset,
      sourcePositionId: pos.id,
      createDate:       today,
      sellPrice:        currentPrice,
      usdcAmount:       usdcReceived,
    });
    return { ok: true, txHash };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
