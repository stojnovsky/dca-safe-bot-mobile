import type { CryptoPosition, PositionLifecycleEvent } from './types';

export type PositionsViewFilter = 'all' | 'open' | 'closed' | 'profit' | 'loss' | 'reopened';

export const POSITION_VIEW_FILTERS: { key: PositionsViewFilter; label: string }[] = [
  { key: 'all',      label: 'All'      },
  { key: 'open',     label: 'Open'     },
  { key: 'closed',   label: 'Closed'   },
  { key: 'profit',   label: 'Profit'   },
  { key: 'loss',     label: 'Loss'     },
  { key: 'reopened', label: 'Reopened' },
];

export function positionHasReopenLifecycle(lifecycle?: PositionLifecycleEvent[] | null): boolean {
  return Array.isArray(lifecycle) && lifecycle.some((e) => e.action === 'reopen');
}

/** Fields needed for filter chips (simulation `CryptoPosition` or live `Position` + optional unrealized for open rows). */
export type PositionFilterFields = Pick<
  CryptoPosition,
  'status' | 'profitPct' | 'unrealizedPnlPct' | 'closeReason' | 'lifecycle'
>;

export function matchesPositionViewFilter(p: PositionFilterFields, filter: PositionsViewFilter): boolean {
  if (filter === 'all') return true;

  const isOpen = p.status === 'OPEN';
  const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);

  switch (filter) {
    case 'open':
      return isOpen;
    case 'closed':
      return !isOpen;
    case 'profit':
      return pnl >= 0;
    case 'loss':
      if (isOpen) return pnl < 0;
      return (p.profitPct ?? 0) < 0 || p.closeReason === 'stop_loss';
    case 'reopened':
      return positionHasReopenLifecycle(p.lifecycle);
    default:
      return true;
  }
}
