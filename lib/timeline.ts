import type { CryptoPosition, DailyPrice } from './types';
import type { ChartPoint } from '@/components/PortfolioChart';
import { addLocalCalendarDays, localCalendarDate } from './calendar-day';

interface BuildOpts {
  /** ETH price for "today" (from live API) — used when historical map lacks the latest day */
  liveEthPrice?: number;
  /** BTC price for "today" (from live API) */
  liveBtcPrice?: number;
}

/**
 * Build a daily { date, invested, portfolioValue, pnlPercent } series from
 * the user's actual positions and cached historical prices.
 *
 * - `invested` = cumulative USDC spent up to that day
 * - `portfolioValue` = sum over positions of: open => assetAmount * historicalPrice,
 *                                              closed (sold by `date`) => usdcReceived
 */
export function buildPositionTimeline(
  positions: CryptoPosition[],
  ethPrices: DailyPrice[],
  btcPrices: DailyPrice[],
  opts: BuildOpts = {},
): ChartPoint[] {
  if (positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => a.buyDate.localeCompare(b.buyDate));
  const startDate = sorted[0].buyDate;
  const endDate = localCalendarDate();

  const ethMap = new Map(ethPrices.map((p) => [p.date, p.price]));
  const btcMap = new Map(btcPrices.map((p) => [p.date, p.price]));

  let lastEth = ethPrices[0]?.price ?? sorted.find((p) => p.asset === 'ETH')?.buyPrice ?? 0;
  let lastBtc = btcPrices[0]?.price ?? sorted.find((p) => p.asset === 'BTC')?.buyPrice ?? 0;

  const points: ChartPoint[] = [];
  let dateStr = startDate;

  while (dateStr <= endDate) {
    const isToday = dateStr === endDate;
    const ethPrice = ethMap.get(dateStr) ?? (isToday ? opts.liveEthPrice ?? lastEth : lastEth);
    const btcPrice = btcMap.get(dateStr) ?? (isToday ? opts.liveBtcPrice ?? lastBtc : lastBtc);
    if (ethMap.has(dateStr)) lastEth = ethPrice;
    if (btcMap.has(dateStr)) lastBtc = btcPrice;

    let invested = 0;
    let value = 0;

    for (const pos of sorted) {
      if (pos.buyDate > dateStr) break;
      invested += pos.usdcInvested;

      if (pos.status === 'CLOSED' && pos.sellDate && pos.sellDate <= dateStr) {
        value += pos.usdcReceived ?? 0;
      } else {
        const price = pos.asset === 'ETH' ? ethPrice : btcPrice;
        value += pos.assetAmount * price;
      }
    }

    points.push({
      date: dateStr,
      invested,
      portfolioValue: value,
      pnlPercent: invested > 0 ? ((value - invested) / invested) * 100 : 0,
    });

    dateStr = addLocalCalendarDays(dateStr, 1);
  }

  return points;
}
