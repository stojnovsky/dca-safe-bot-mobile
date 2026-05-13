export interface DailyPrice {
  date: string; // YYYY-MM-DD
  price: number;
}

/** How a closed spot position was exited (for UI / gamification). */
export type PositionCloseReason = 'take_profit' | 'stop_loss';

/** Journal entries for opens / closes / reopens (shown in coin detail). */
export type PositionLifecycleAction =
  | 'open'
  | 'close_take_profit'
  | 'close_stop_loss'
  | 'reopen';

export interface PositionLifecycleEvent {
  date: string;
  action: PositionLifecycleAction;
  price: number;
  usdcInvested?: number;
  assetAmount?: number;
  usdcReceived?: number;
  profitPct?: number;
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
  closeReason?: PositionCloseReason;
  /** Open / close / reopen history for this row (simulation + persisted live). */
  lifecycle?: PositionLifecycleEvent[];
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
  /**
   * When true, close positions whose unrealized PnL from buy price is at or
   * below negative stopLossPct (same day, after take-profit checks).
   */
  stopLossEnabled?: boolean;
  /** Positive magnitude, e.g. `10` = exit at −10% from entry. Ignored when disabled. */
  stopLossPct?: number;
  /**
   * When true, a **closed** row can become OPEN again if spot falls at least
   * **reopenDownPct** % below the price at which it was last sold.
   */
  reopenEnabled?: boolean;
  /** Positive magnitude: reopen when spot is at or below last sell × (1 − pct/100). */
  reopenDownPct?: number;
}

export interface BotConfig extends BacktestConfig {
  safeAddress: string;
  rpcUrl: string;
  pricesApiUrl: string;
  /** Show the developer-oriented "Logs" tab in the bottom tabbar. Off by default. */
  showLogsTab?: boolean;
  /** Render positions as gamified "Daily Coins" instead of a plain table. On by default. */
  gamifyPositions?: boolean;
}
