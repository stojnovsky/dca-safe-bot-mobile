import { getPricesApiUrl } from './config-store';
import { HISTORY_START } from './constants';
import type { DailyPrice } from './types';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = (await getPricesApiUrl()).replace(/\/+$/, '');
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) throw new Error(`prices-api ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function getPricesForRange(
  asset: string,
  fromDate: string,
  toDate: string,
): Promise<DailyPrice[]> {
  const qs = `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
  const json = await api<{ prices: DailyPrice[] }>(`/api/prices/${asset}${qs}`);
  return json.prices;
}

export async function seedAllPrices(
  fromDate = HISTORY_START,
): Promise<{ ethereum: number; bitcoin: number }> {
  const json = await api<{ seeded: { ethereum: number; bitcoin: number } }>(
    `/api/prices/seed?from=${encodeURIComponent(fromDate)}`,
    { method: 'POST' },
  );
  return json.seeded;
}

type Coverage = {
  ethereum: { from: string | null; to: string | null; count: number };
  bitcoin:  { from: string | null; to: string | null; count: number };
};

export async function getPriceCoverage(): Promise<Coverage> {
  return api<Coverage>('/api/prices/coverage');
}
