import type { BacktestConfig } from './types';

/** Take-profit threshold (% gain from buy) for the asset. */
export function takeProfitPct(cfg: BacktestConfig, asset: 'ETH' | 'BTC'): number {
  return asset === 'ETH' ? (cfg.profitThresholdEth ?? 5) : (cfg.profitThresholdBtc ?? 5);
}

/** Stop-loss magnitude (% drawdown from buy); used only when `stopLossEnabled`. */
export function stopLossPctFor(cfg: BacktestConfig, asset: 'ETH' | 'BTC'): number {
  return asset === 'ETH' ? (cfg.stopLossPctEth ?? 10) : (cfg.stopLossPctBtc ?? 10);
}

/** Reopen when spot ≤ last exit × (1 − pct/100). */
export function reopenDownPctFor(cfg: BacktestConfig, asset: 'ETH' | 'BTC'): number {
  return asset === 'ETH' ? (cfg.reopenDownPctEth ?? 5) : (cfg.reopenDownPctBtc ?? 5);
}
