import { getDb } from './db';
import { randomUUID } from 'expo-crypto';

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
}

export interface UsdcPos {
  id: string;
  sourceAsset: 'ETH' | 'BTC';
  sourcePositionId: string;
  createDate: string;
  sellPrice: number;
  usdcAmount: number;
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
  const db  = await getDb();
  const id  = randomUUID();
  await db.runAsync(
    `INSERT INTO positions (id, asset, buy_date, buy_price, usdc_invested, asset_amount, buy_tx_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
    [id, data.asset, data.buyDate, data.buyPrice, data.usdcInvested, data.assetAmount, data.buyTxHash],
  );
  return { ...data, id, status: 'OPEN' };
}

export async function closePosition(
  id: string,
  data: { sellDate: string; sellPrice: number; usdcReceived: number; sellTxHash: string; profitUsd: number; profitPct: number },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE positions SET status='CLOSED', sell_date=?, sell_price=?, usdc_received=?,
     sell_tx_hash=?, profit_usd=?, profit_pct=? WHERE id=?`,
    [data.sellDate, data.sellPrice, data.usdcReceived, data.sellTxHash, data.profitUsd, data.profitPct, id],
  );
}

export async function getOpenPositions(): Promise<Position[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM positions WHERE status = 'OPEN' ORDER BY buy_date ASC",
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
