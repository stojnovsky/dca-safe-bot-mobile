import type { DailyPrice, SimulationDay, SimulationResult, BacktestConfig, CryptoPosition, UsdcPosition } from './types';

function toDateMap(prices: DailyPrice[]): Map<string, number> {
  return new Map(prices.map((p) => [p.date, p.price]));
}

export function runSimulation(
  ethPrices: DailyPrice[],
  btcPrices: DailyPrice[],
  config: BacktestConfig,
  investmentStartDate: string,
): SimulationResult {
  const ethMap = toDateMap(ethPrices);
  const btcMap = toDateMap(btcPrices);

  const allDates = ethPrices
    .map((p) => p.date)
    .filter((d) => d >= investmentStartDate && btcMap.has(d))
    .sort();

  const cryptoPositions: CryptoPosition[] = [];
  const usdcPositions: UsdcPosition[] = [];
  let counter = 0;
  const nextId = () => String(++counter);

  let totalInvested = 0;
  let totalUsdcFromSells = 0;
  const days: SimulationDay[] = [];

  for (const date of allDates) {
    const ethPrice = ethMap.get(date)!;
    const btcPrice = btcMap.get(date)!;

    let dailyUsdcReceived = 0;
    let positionsClosed = 0;

    for (const pos of cryptoPositions) {
      if (pos.status !== 'OPEN') continue;
      const price = pos.asset === 'ETH' ? ethPrice : btcPrice;
      const pnlPct = ((price - pos.buyPrice) / pos.buyPrice) * 100;
      if (pnlPct < config.profitThreshold) continue;

      const usdcReceived = pos.assetAmount * price;
      pos.status       = 'CLOSED';
      pos.sellDate     = date;
      pos.sellPrice    = price;
      pos.usdcReceived = usdcReceived;
      pos.profitUsd    = usdcReceived - pos.usdcInvested;
      pos.profitPct    = pnlPct;

      const usdcId = nextId();
      pos.usdcPositionId = usdcId;
      usdcPositions.push({
        id: usdcId,
        sourceAsset: pos.asset,
        sourceCryptoPositionId: pos.id,
        createDate: date,
        sellPrice: price,
        usdcAmount: usdcReceived,
      });

      dailyUsdcReceived += usdcReceived;
      totalUsdcFromSells += usdcReceived;
      positionsClosed++;
    }

    cryptoPositions.push(
      {
        id: nextId(), asset: 'ETH', buyDate: date, buyPrice: ethPrice,
        usdcInvested: config.dailyAmountEth,
        assetAmount: config.dailyAmountEth / ethPrice,
        status: 'OPEN',
      },
      {
        id: nextId(), asset: 'BTC', buyDate: date, buyPrice: btcPrice,
        usdcInvested: config.dailyAmountBtc,
        assetAmount: config.dailyAmountBtc / btcPrice,
        status: 'OPEN',
      },
    );
    totalInvested += config.dailyAmountEth + config.dailyAmountBtc;

    let ethHolding = 0, btcHolding = 0;
    for (const pos of cryptoPositions) {
      if (pos.status !== 'OPEN') continue;
      if (pos.asset === 'ETH') ethHolding += pos.assetAmount;
      else btcHolding += pos.assetAmount;
    }

    const totalCryptoValue = ethHolding * ethPrice + btcHolding * btcPrice;
    const totalValue = totalCryptoValue + totalUsdcFromSells;

    days.push({
      date, ethPrice, btcPrice,
      positionsOpened: 2,
      positionsClosed,
      usdcSpent: config.dailyAmountEth + config.dailyAmountBtc,
      usdcReceived: dailyUsdcReceived,
      ethHolding, btcHolding,
      totalInvested, totalCryptoValue, totalUsdcFromSells, totalValue,
      pnlPercent: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
    });
  }

  const last = days[days.length - 1];
  for (const pos of cryptoPositions) {
    if (pos.status !== 'OPEN') continue;
    const price = pos.asset === 'ETH' ? (last?.ethPrice ?? 0) : (last?.btcPrice ?? 0);
    pos.finalPrice = price;
    pos.finalValue = pos.assetAmount * price;
    pos.unrealizedPnlUsd = pos.finalValue - pos.usdcInvested;
    pos.unrealizedPnlPct = ((price - pos.buyPrice) / pos.buyPrice) * 100;
  }

  const closed = cryptoPositions.filter((p) => p.status === 'CLOSED');
  const totalRealizedProfitUsd = closed.reduce((s, p) => s + (p.profitUsd ?? 0), 0);

  return {
    days,
    cryptoPositions,
    usdcPositions,
    summary: {
      startDate:           days[0]?.date ?? investmentStartDate,
      endDate:             last?.date ?? investmentStartDate,
      totalDays:           allDates.length,
      totalInvested:       last?.totalInvested ?? 0,
      finalCryptoValue:    last?.totalCryptoValue ?? 0,
      finalUsdcFromSells:  last?.totalUsdcFromSells ?? 0,
      finalTotalValue:     last?.totalValue ?? 0,
      finalEthAmount:      last?.ethHolding ?? 0,
      finalBtcAmount:      last?.btcHolding ?? 0,
      pnlUsd:              (last?.totalValue ?? 0) - (last?.totalInvested ?? 0),
      pnlPercent:          last?.pnlPercent ?? 0,
      totalPositions:      cryptoPositions.length,
      openPositions:       cryptoPositions.filter((p) => p.status === 'OPEN').length,
      closedPositions:     closed.length,
      totalUsdcPositions:  usdcPositions.length,
      totalRealizedProfitUsd,
      avgProfitPctPerSell: closed.length > 0
        ? closed.reduce((s, p) => s + (p.profitPct ?? 0), 0) / closed.length
        : 0,
    },
  };
}
