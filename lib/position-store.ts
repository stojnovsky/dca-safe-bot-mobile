import { getDb } from './db';
import { randomUUID } from 'expo-crypto';
import type { PositionCloseReason, PositionLifecycleEvent } from './types';

export interface Position {
  id: string;
  asset: 'ETH' | 'BTC';
  buyDate: string;
  buyPrice: number;
  usdcInvested: number;
  assetAmount: number;
  buyTxHash: string;
  status: 'OPEN' | 'CLOSED';
  sellDate?: string;
  sellPrice?: number;
  usdcReceived?: number;
  sellTxHash?: string;
  profitUsd?: number;
  profitPct?: number;
  closeReason?: PositionCloseReason;
  lifecycle?: PositionLifecycleEvent[];
}

export interface UsdcPos {
  id: string;
  sourceAsset: 'ETH' | 'BTC';
  sourcePositionId: string;
  createDate: string;
  sellPrice: number;
  usdcAmount: number;
}

function parseCloseReason(raw: unknown): PositionCloseReason | undefined {
  if (raw === 'take_profit' || raw === 'stop_loss') return raw;
  return undefined;
}

/** Parse stored JSON or synthesize from row for older DB rows. */
export function lifecycleFromRow(row: Record<string, unknown>): PositionLifecycleEvent[] {
  const raw = row.lifecycle_json as string | null | undefined;
  if (raw) {
    try {
      const p = JSON.parse(raw) as PositionLifecycleEvent[];
      if (Array.isArray(p) && p.length > 0) return p;
    } catch {
      /* fall through */
    }
  }
  const L: PositionLifecycleEvent[] = [{
    date:          row.buy_date as string,
    action:        'open',
    price:         row.buy_price as number,
    usdcInvested:  row.usdc_invested as number,
    assetAmount:   row.asset_amount as number,
  }];
  if (row.status === 'CLOSED' && row.sell_date) {
    const cr = parseCloseReason(row.close_reason);
    L.push({
      date:          row.sell_date as string,
      action:        cr === 'stop_loss' ? 'close_stop_loss' : 'close_take_profit',
      price:         (row.sell_price as number) ?? 0,
      usdcReceived:  (row.usdc_received as number) ?? undefined,
      profitPct:     (row.profit_pct as number) ?? undefined,
    });
  }
  return L;
}

function rowToPosition(row: Record<string, unknown>): Position {
  return {
    id:           row.id as string,
    asset:        row.asset as 'ETH' | 'BTC',
    buyDate:      row.buy_date as string,
    buyPrice:     row.buy_price as number,
    usdcInvested: row.usdc_invested as number,
    assetAmount:  row.asset_amount as number,
    buyTxHash:    row.buy_tx_hash as string,
    status:       row.status as 'OPEN' | 'CLOSED',
    sellDate:     (row.sell_date as string | null) ?? undefined,
    sellPrice:    (row.sell_price as number | null) ?? undefined,
    usdcReceived: (row.usdc_received as number | null) ?? undefined,
    sellTxHash:   (row.sell_tx_hash as string | null) ?? undefined,
    profitUsd:    (row.profit_usd as number | null) ?? undefined,
    profitPct:    (row.profit_pct as number | null) ?? undefined,
    closeReason:  parseCloseReason(row.close_reason),
    lifecycle:    lifecycleFromRow(row),
  };
}

function rowToUsdcPos(row: Record<string, unknown>): UsdcPos {
  return {
    id:               row.id as string,
    sourceAsset:      row.source_asset as 'ETH' | 'BTC',
    sourcePositionId: row.source_position_id as string,
    createDate:       row.create_date as string,
    sellPrice:        row.sell_price as number,
    usdcAmount:       row.usdc_amount as number,
  };
}

export async function createPosition(data: Omit<Position, 'id' | 'status'>): Promise<Position> {
  const db   = await getDb();
  const id   = randomUUID();
  const life: PositionLifecycleEvent[] = [{
    date:         data.buyDate,
    action:       'open',
    price:        data.buyPrice,
    usdcInvested: data.usdcInvested,
    assetAmount:  data.assetAmount,
  }];
  const lifeJson = JSON.stringify(life);
  await db.runAsync(
    `INSERT INTO positions (id, asset, buy_date, buy_price, usdc_invested, asset_amount, buy_tx_hash, status, lifecycle_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    [id, data.asset, data.buyDate, data.buyPrice, data.usdcInvested, data.assetAmount, data.buyTxHash, lifeJson],
  );
  return { ...data, id, status: 'OPEN', lifecycle: life };
}

export async function closePosition(
  id: string,
  data: {
    sellDate: string;
    sellPrice: number;
    usdcReceived: number;
    sellTxHash: string;
    profitUsd: number;
    profitPct: number;
    closeReason?: PositionCloseReason;
  },
): Promise<void> {
  const db  = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM positions WHERE id = ?', [id]);
  const life = lifecycleFromRow(row ?? {});
  life.push({
    date:         data.sellDate,
    action:       data.closeReason === 'stop_loss' ? 'close_stop_loss' : 'close_take_profit',
    price:        data.sellPrice,
    usdcReceived: data.usdcReceived,
    profitPct:    data.profitPct,
  });
  await db.runAsync(
    `UPDATE positions SET status='CLOSED', sell_date=?, sell_price=?, usdc_received=?,
     sell_tx_hash=?, profit_usd=?, profit_pct=?, close_reason=?, lifecycle_json=? WHERE id=?`,
    [
      data.sellDate,
      data.sellPrice,
      data.usdcReceived,
      data.sellTxHash,
      data.profitUsd,
      data.profitPct,
      data.closeReason ?? null,
      JSON.stringify(life),
      id,
    ],
  );
}

/**
 * Turn a closed row back into an open leg using proceeds from the last sell
 * (same position id; lifecycle gains a `reopen` entry).
 */
export async function reopenPosition(
  id: string,
  data: {
    buyDate: string;
    buyPrice: number;
    usdcInvested: number;
    assetAmount: number;
    buyTxHash: string;
  },
): Promise<void> {
  const db  = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM positions WHERE id = ?', [id]);
  const life = lifecycleFromRow(row ?? {});
  life.push({
    date:         data.buyDate,
    action:       'reopen',
    price:        data.buyPrice,
    usdcInvested: data.usdcInvested,
    assetAmount:  data.assetAmount,
  });
  await db.runAsync(
    `UPDATE positions SET status='OPEN', buy_date=?, buy_price=?, usdc_invested=?, asset_amount=?, buy_tx_hash=?,
     sell_date=NULL, sell_price=NULL, usdc_received=NULL, sell_tx_hash=NULL, profit_usd=NULL, profit_pct=NULL, close_reason=NULL,
     lifecycle_json=? WHERE id=?`,
    [
      data.buyDate,
      data.buyPrice,
      data.usdcInvested,
      data.assetAmount,
      data.buyTxHash,
      JSON.stringify(life),
      id,
    ],
  );
}

export async function getPositionById(id: string): Promise<Position | null> {
  const db  = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM positions WHERE id = ?', [id]);
  return row ? rowToPosition(row) : null;
}

export async function getOpenPositions(): Promise<Position[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM positions WHERE status = 'OPEN' ORDER BY buy_date ASC",
  );
  return rows.map(rowToPosition);
}

/** Closed rows that may be reopened (have exit price and USDC proceeds). */
export async function getClosedPositionsForReopen(): Promise<Position[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM positions WHERE status = 'CLOSED'
       AND sell_price IS NOT NULL
       AND usdc_received IS NOT NULL
       AND usdc_received >= 1
     ORDER BY sell_date ASC`,
  );
  return rows.map(rowToPosition);
}

export async function getAllPositions(): Promise<Position[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM positions ORDER BY buy_date DESC',
  );
  return rows.map(rowToPosition);
}

export async function hasPositionForDate(asset: 'ETH' | 'BTC', date: string): Promise<boolean> {
  const db  = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM positions WHERE asset = ? AND buy_date = ?",
    [asset, date],
  );
  return (row?.cnt ?? 0) > 0;
}

export async function createUsdcPosition(data: Omit<UsdcPos, 'id'>): Promise<UsdcPos> {
  const db = await getDb();
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO usdc_positions (id, source_asset, source_position_id, create_date, sell_price, usdc_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.sourceAsset, data.sourcePositionId, data.createDate, data.sellPrice, data.usdcAmount],
  );
  return { ...data, id };
}

export async function getAllUsdcPositions(): Promise<UsdcPos[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM usdc_positions ORDER BY create_date DESC',
  );
  return rows.map(rowToUsdcPos);
}
