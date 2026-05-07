import { getDb } from './db';
import { getCoinGeckoKey } from './config-store';
import { CG_PRO_BASE, CG_DEMO_BASE, HISTORY_START } from './constants';
import type { DailyPrice } from './types';

async function cgFetch(path: string): Promise<Response> {
  const key = await getCoinGeckoKey();
  const base = key ? CG_PRO_BASE : CG_DEMO_BASE;
  const headers: Record<string, string> = key
    ? { 'x-cg-pro-api-key': key }
    : {};
  return fetch(`${base}${path}`, { headers });
}

async function fetchCoinGeckoRange(
  coinId: string,
  from: Date,
  to: Date,
): Promise<DailyPrice[]> {
  const fromUnix = Math.floor(from.getTime() / 1000);
  const toUnix   = Math.floor(to.getTime()   / 1000);
  const res = await cgFetch(
    `/coins/${coinId}/market_chart/range?vs_currency=usd&from=${fromUnix}&to=${toUnix}`,
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const dateMap = new Map<string, number>();
  for (const [ts, price] of json.prices as [number, number][]) {
    dateMap.set(new Date(ts).toISOString().slice(0, 10), price);
  }
  return Array.from(dateMap.entries())
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function upsertPrices(asset: string, prices: DailyPrice[]): Promise<void> {
  if (prices.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const p of prices) {
      await db.runAsync(
        'INSERT OR REPLACE INTO price_cache (asset, date, price) VALUES (?, ?, ?)',
        [asset, p.date, p.price],
      );
    }
  });
}

export async function seedAllPrices(fromDate = HISTORY_START): Promise<{ ethereum: number; bitcoin: number }> {
  const counts = { ethereum: 0, bitcoin: 0 };
  const todayMs = Date.now();

  for (const coinId of ['ethereum', 'bitcoin'] as const) {
    let cur = new Date(fromDate);
    while (cur.getTime() < todayMs) {
      const end = new Date(cur);
      end.setDate(end.getDate() + 364);
      if (end.getTime() > todayMs) end.setTime(todayMs);

      const prices = await fetchCoinGeckoRange(coinId, cur, end);
      await upsertPrices(coinId, prices);
      counts[coinId] += prices.length;

      cur.setDate(cur.getDate() + 365);
      if (cur.getTime() < todayMs) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  return counts;
}

export async function getPricesForRange(
  asset: string,
  fromDate: string,
  toDate: string,
): Promise<DailyPrice[]> {
  // Always refresh last 2 days so today's price is current
  const today = new Date();
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

  if (toDate >= twoDaysAgoStr) {
    try {
      const recent = await fetchCoinGeckoRange(asset, twoDaysAgo, today);
      await upsertPrices(asset, recent);
    } catch { /* serve stale data */ }
  }

  const db = await getDb();
  return db.getAllAsync<{ date: string; price: number }>(
    'SELECT date, price FROM price_cache WHERE asset = ? AND date >= ? AND date <= ? ORDER BY date ASC',
    [asset, fromDate, toDate],
  );
}

export async function getPriceCoverage(): Promise<{
  ethereum: { from: string | null; to: string | null; count: number };
  bitcoin:  { from: string | null; to: string | null; count: number };
}> {
  const db = await getDb();
  const result: Record<string, { from: string | null; to: string | null; count: number }> = {};

  for (const asset of ['ethereum', 'bitcoin']) {
    const first = await db.getFirstAsync<{ date: string }>(
      'SELECT date FROM price_cache WHERE asset = ? ORDER BY date ASC LIMIT 1', [asset],
    );
    const last = await db.getFirstAsync<{ date: string }>(
      'SELECT date FROM price_cache WHERE asset = ? ORDER BY date DESC LIMIT 1', [asset],
    );
    const countRow = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM price_cache WHERE asset = ?', [asset],
    );
    result[asset] = {
      from:  first?.date ?? null,
      to:    last?.date  ?? null,
      count: countRow?.cnt ?? 0,
    };
  }
  return result as {
    ethereum: { from: string | null; to: string | null; count: number };
    bitcoin:  { from: string | null; to: string | null; count: number };
  };
}
