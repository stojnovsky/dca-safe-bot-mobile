import type { CryptoPosition } from './types';

/** Coins per row in the vault grid (simulation + portfolio). */
export const VAULT_COINS_PER_ROW = 4;

const GAP_PX = 6;

/** Monday `YYYY-MM-DD` in local calendar for the week containing `isoDate` (`YYYY-MM-DD`). */
export function mondayKey(isoDate: string): string {
  const [Y, Mo, D] = isoDate.split('-').map(Number);
  const d = new Date(Y, Mo - 1, D, 12, 0, 0);
  const offset = (d.getDay() + 6) % 7; // Mon = 0
  const m = new Date(d);
  m.setDate(d.getDate() - offset);
  const y = m.getFullYear();
  const mm = String(m.getMonth() + 1).padStart(2, '0');
  const dd = String(m.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Short label like `5/5–5/11` for the week starting `mondayKey`. */
export function weekRangeLabelFromMonday(mondayKey: string): string {
  const [Y, Mo, D] = mondayKey.split('-').map(Number);
  const start = new Date(Y, Mo - 1, D, 12, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const short = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;
  return `${short(start)}–${short(end)}`;
}

export function monthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export interface VaultWeekGroup {
  weekKey:   string;
  weekLabel: string;
  items:     CryptoPosition[];
}

export interface VaultMonthGroup {
  monthKey:   string;
  monthLabel: string;
  weeks:      VaultWeekGroup[];
}

export interface VaultYearGroup {
  year:    number;
  months:  VaultMonthGroup[];
}

/**
 * Groups positions for the coin vault: **year → month → week (Mon–Sun)**.
 * Newest years/months/weeks first; within each week, positions stay in the
 * same order as `positions` (caller should pass newest-first list).
 */
export function groupPositionsByYMW(positions: CryptoPosition[]): VaultYearGroup[] {
  type WeekMap = Map<string, CryptoPosition[]>;
  type MonthMap = Map<string, WeekMap>;
  type YearMap = Map<number, MonthMap>;

  const tree: YearMap = new Map();

  for (const p of positions) {
    const year = +p.buyDate.slice(0, 4);
    const monthKey = p.buyDate.slice(0, 7);
    const wk = mondayKey(p.buyDate);

    if (!tree.has(year)) tree.set(year, new Map());
    const ym = tree.get(year)!;
    if (!ym.has(monthKey)) ym.set(monthKey, new Map());
    const wm = ym.get(monthKey)!;
    if (!wm.has(wk)) wm.set(wk, []);
    wm.get(wk)!.push(p);
  }

  const years = [...tree.keys()].sort((a, b) => b - a);
  const out: VaultYearGroup[] = [];

  for (const year of years) {
    const ym = tree.get(year)!;
    const monthKeys = [...ym.keys()].sort((a, b) => b.localeCompare(a));
    const months: VaultMonthGroup[] = monthKeys.map((monthKey) => {
      const wm = ym.get(monthKey)!;
      const weekKeys = [...wm.keys()].sort((a, b) => b.localeCompare(a));
      const weeks: VaultWeekGroup[] = weekKeys.map((weekKey) => ({
        weekKey,
        weekLabel: weekRangeLabelFromMonday(weekKey),
        items:     wm.get(weekKey)!,
      }));
      return {
        monthKey,
        monthLabel: monthLabelFromKey(monthKey),
        weeks,
      };
    });
    out.push({ year, months });
  }

  return out;
}

/** All positions in a year (newest-first order preserved from tree walk). */
export function flattenYearPositions(y: VaultYearGroup): CryptoPosition[] {
  return y.months.flatMap((m) => m.weeks.flatMap((w) => w.items));
}

/** All positions in a calendar month bucket. */
export function flattenMonthPositions(m: VaultMonthGroup): CryptoPosition[] {
  return m.weeks.flatMap((w) => w.items);
}

/** Pixel width of one coin cell for `VAULT_COINS_PER_ROW` columns + gaps. */
export function vaultCoinSlotWidth(innerWidth: number): number {
  const w = Math.max(0, innerWidth);
  return Math.floor((w - GAP_PX * (VAULT_COINS_PER_ROW - 1)) / VAULT_COINS_PER_ROW);
}
