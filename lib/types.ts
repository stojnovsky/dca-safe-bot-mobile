export interface DailyPrice {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface CryptoPosition {
  id: string;
  asset: 'ETH' | 'BTC';
  buyDate: string;
  buyPrice: number;
  usdcInvested: number;
  assetAmount: number;
  status: 'OPEN' | 'CLOSED';
  sellDate?: string;
  sellPrice?: number;
  usdcReceived?: number;
  profitUsd?: number;
  profitPct?: number;
  usdcPositionId?: string;
  finalPrice?: number;
  finalValue?: number;
  unrealizedPnlUsd?: number;
  unrealizedPnlPct?: number;
}

export interface UsdcPosition {
  id: string;
  sourceAsset: 'ETH' | 'BTC';
  sourceCryptoPositionId: string;
  createDate: string;
  sellPrice: number;
  usdcAmount: number;
}

export interface SimulationDay {
  date: string;
  ethPrice: number;
  btcPrice: number;
  positionsOpened: number;
  positionsClosed: number;
  usdcSpent: number;
  usdcReceived: number;
  ethHolding: number;
  btcHolding: number;
  totalInvested: number;
  totalCryptoValue: number;
  totalUsdcFromSells: number;
  totalValue: number;
  pnlPercent: number;
}

export interface SimulationResult {
  days: SimulationDay[];
  cryptoPositions: CryptoPosition[];
  usdcPositions: UsdcPosition[];
  summary: {
    startDate: string;
    endDate: string;
    totalDays: number;
    totalInvested: number;
    finalCryptoValue: number;
    finalUsdcFromSells: number;
    finalTotalValue: number;
    finalEthAmount: number;
    finalBtcAmount: number;
    pnlUsd: number;
    pnlPercent: number;
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalUsdcPositions: number;
    totalRealizedProfitUsd: number;
    avgProfitPctPerSell: number;
  };
}

export interface BacktestConfig {
  dailyAmountEth: number;
  dailyAmountBtc: number;
  profitThreshold: number;
}

export interface BotConfig extends BacktestConfig {
  safeAddress: string;
  rpcUrl: string;
}
