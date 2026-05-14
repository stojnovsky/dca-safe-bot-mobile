import { getDb } from './db';
import { getAllPositions, getAllUsdcPositions } from './position-store';
import type { Position, UsdcPos } from './position-store';
import type { PositionCloseReason, PositionLifecycleEvent } from './types';

export const POSITIONS_EXPORT_FORMAT = 'dca-safe-positions-v1' as const;

export interface PositionsExportV1 {
  format: typeof POSITIONS_EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  positions: Position[];
  usdcPositions: UsdcPos[];
}

export interface ImportPositionsResult {
  positionsImported: number;
  positionsSkipped: number;
  usdcImported: number;
  usdcSkipped: number;
}

const MAX_POSITIONS = 20_000;
const MAX_USDC      = 20_000;

function parseCloseReason(v: unknown): PositionCloseReason | undefined {
  if (v === 'take_profit' || v === 'stop_loss') return v;
  return undefined;
}

function isValidLifecycle(x: unknown): x is PositionLifecycleEvent[] {
  if (!Array.isArray(x) || x.length === 0) return false;
  for (const e of x) {
    if (!e || typeof e !== 'object') return false;
    const o = e as Record<string, unknown>;
    if (typeof o.date !== 'string' || typeof o.action !== 'string') return false;
  }
  return true;
}

function synthesizeLifecycle(p: {
  buyDate: string;
  buyPrice: number;
  usdcInvested: number;
  assetAmount: number;
  status: string;
  sellDate?: string;
  sellPrice?: number;
  usdcReceived?: number;
  profitPct?: number;
  closeReason?: PositionCloseReason;
}): PositionLifecycleEvent[] {
  const L: PositionLifecycleEvent[] = [{
    date: p.buyDate,
    action: 'open',
    price: p.buyPrice,
    usdcInvested: p.usdcInvested,
    assetAmount: p.assetAmount,
  }];
  if (p.status === 'CLOSED' && p.sellDate) {
    const cr = p.closeReason;
    L.push({
      date: p.sellDate,
      action: cr === 'stop_loss' ? 'close_stop_loss' : 'close_take_profit',
      price: p.sellPrice ?? 0,
      usdcReceived: p.usdcReceived,
      profitPct: p.profitPct,
    });
  }
  return L;
}

function validatePosition(o: unknown): Position | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const id = r.id;
  const asset = r.asset;
  const buyDate = r.buyDate;
  const buyPrice = r.buyPrice;
  const usdcInvested = r.usdcInvested;
  const assetAmount = r.assetAmount;
  const buyTxHash = r.buyTxHash;
  const status = r.status;

  if (typeof id !== 'string' || id.length === 0 || id.length > 128) return null;
  if (asset !== 'ETH' && asset !== 'BTC') return null;
  if (typeof buyDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(buyDate)) return null;
  if (typeof buyPrice !== 'number' || !Number.isFinite(buyPrice) || buyPrice <= 0) return null;
  if (typeof usdcInvested !== 'number' || !Number.isFinite(usdcInvested) || usdcInvested < 0) return null;
  if (typeof assetAmount !== 'number' || !Number.isFinite(assetAmount) || assetAmount <= 0) return null;
  if (typeof buyTxHash !== 'string' || buyTxHash.length > 256) return null;
  if (status !== 'OPEN' && status !== 'CLOSED') return null;

  let sellDate: string | undefined;
  let sellPrice: number | undefined;
  let usdcReceived: number | undefined;
  let sellTxHash: string | undefined;
  let profitUsd: number | undefined;
  let profitPct: number | undefined;
  let closeReason: PositionCloseReason | undefined;

  if (status === 'CLOSED') {
    if (typeof r.sellDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.sellDate)) return null;
    sellDate = r.sellDate;
    if (typeof r.sellPrice !== 'number' || !Number.isFinite(r.sellPrice) || r.sellPrice <= 0) return null;
    sellPrice = r.sellPrice;
    if (typeof r.usdcReceived !== 'number' || !Number.isFinite(r.usdcReceived) || r.usdcReceived < 0) return null;
    usdcReceived = r.usdcReceived;
    sellTxHash = typeof r.sellTxHash === 'string' && r.sellTxHash.length <= 256 ? r.sellTxHash : '';
    if (typeof r.profitUsd === 'number' && Number.isFinite(r.profitUsd)) profitUsd = r.profitUsd;
    if (typeof r.profitPct === 'number' && Number.isFinite(r.profitPct)) profitPct = r.profitPct;
    closeReason = parseCloseReason(r.closeReason);
  }

  let lifecycle: PositionLifecycleEvent[] | undefined;
  if (isValidLifecycle(r.lifecycle)) {
    lifecycle = r.lifecycle;
  } else {
    lifecycle = synthesizeLifecycle({
      buyDate,
      buyPrice,
      usdcInvested,
      assetAmount,
      status,
      sellDate,
      sellPrice,
      usdcReceived,
      profitPct,
      closeReason,
    });
  }

  return {
    id,
    asset,
    buyDate,
    buyPrice,
    usdcInvested,
    assetAmount,
    buyTxHash,
    status,
    sellDate,
    sellPrice,
    usdcReceived,
    sellTxHash,
    profitUsd,
    profitPct,
    closeReason,
    lifecycle,
  };
}

function validateUsdc(o: unknown): UsdcPos | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 128) return null;
  if (r.sourceAsset !== 'ETH' && r.sourceAsset !== 'BTC') return null;
  if (typeof r.sourcePositionId !== 'string' || r.sourcePositionId.length === 0) return null;
  if (typeof r.createDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.createDate)) return null;
  if (typeof r.sellPrice !== 'number' || !Number.isFinite(r.sellPrice) || r.sellPrice <= 0) return null;
  if (typeof r.usdcAmount !== 'number' || !Number.isFinite(r.usdcAmount) || r.usdcAmount < 0) return null;
  return {
    id: r.id,
    sourceAsset: r.sourceAsset,
    sourcePositionId: r.sourcePositionId,
    createDate: r.createDate,
    sellPrice: r.sellPrice,
    usdcAmount: r.usdcAmount,
  };
}

export function parsePositionsExportJson(raw: string): PositionsExportV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Export must be a JSON object');
  const o = parsed as Record<string, unknown>;
  if (o.format !== POSITIONS_EXPORT_FORMAT) throw new Error('Unrecognized export format');
  if (o.version !== 1) throw new Error(`Unsupported export version: ${String(o.version)}`);
  if (typeof o.exportedAt !== 'string') throw new Error('Missing exportedAt');

  if (!Array.isArray(o.positions)) throw new Error('Missing positions array');
  if (!Array.isArray(o.usdcPositions)) throw new Error('Missing usdcPositions array');
  if (o.positions.length > MAX_POSITIONS) throw new Error(`Too many positions (max ${MAX_POSITIONS})`);
  if (o.usdcPositions.length > MAX_USDC) throw new Error(`Too many USDC rows (max ${MAX_USDC})`);

  const positions: Position[] = [];
  for (const row of o.positions) {
    const p = validatePosition(row);
    if (!p) throw new Error('Invalid position row in export');
    positions.push(p);
  }

  const usdcPositions: UsdcPos[] = [];
  for (const row of o.usdcPositions) {
    const u = validateUsdc(row);
    if (!u) throw new Error('Invalid usdc_positions row in export');
    usdcPositions.push(u);
  }

  const posIds = new Set(positions.map((p) => p.id));
  for (const u of usdcPositions) {
    if (!posIds.has(u.sourcePositionId)) {
      throw new Error(`USDC row ${u.id} references unknown position ${u.sourcePositionId}`);
    }
  }

  return {
    format: POSITIONS_EXPORT_FORMAT,
    version: 1,
    exportedAt: o.exportedAt,
    positions,
    usdcPositions,
  };
}

async function insertPositionRow(db: Awaited<ReturnType<typeof getDb>>, p: Position): Promise<void> {
  const lifeJson = JSON.stringify(p.lifecycle ?? synthesizeLifecycle(p));
  await db.runAsync(
    `INSERT INTO positions (id, asset, buy_date, buy_price, usdc_invested, asset_amount, buy_tx_hash, status,
     sell_date, sell_price, usdc_received, sell_tx_hash, profit_usd, profit_pct, close_reason, lifecycle_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id,
      p.asset,
      p.buyDate,
      p.buyPrice,
      p.usdcInvested,
      p.assetAmount,
      p.buyTxHash,
      p.status,
      p.sellDate ?? null,
      p.sellPrice ?? null,
      p.usdcReceived ?? null,
      p.sellTxHash ?? null,
      p.profitUsd ?? null,
      p.profitPct ?? null,
      p.closeReason ?? null,
      lifeJson,
    ],
  );
}

async function insertUsdcRow(db: Awaited<ReturnType<typeof getDb>>, u: UsdcPos): Promise<void> {
  await db.runAsync(
    `INSERT INTO usdc_positions (id, source_asset, source_position_id, create_date, sell_price, usdc_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [u.id, u.sourceAsset, u.sourcePositionId, u.createDate, u.sellPrice, u.usdcAmount],
  );
}

export async function exportPositionsToJson(): Promise<string> {
  const [positions, usdcPositions] = await Promise.all([getAllPositions(), getAllUsdcPositions()]);
  const payload: PositionsExportV1 = {
    format: POSITIONS_EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    positions,
    usdcPositions,
  };
  return JSON.stringify(payload);
}

/**
 * @param mode `replace` — delete all local positions + USDC legs, then load the file (typical device migration).
 *            `merge` — insert only rows whose ids are not already present; skips USDC rows whose source position is missing.
 */
export async function importPositionsFromJson(
  json: string,
  mode: 'replace' | 'merge',
): Promise<ImportPositionsResult> {
  const data = parsePositionsExportJson(json);
  const db = await getDb();

  let positionsImported = 0;
  let positionsSkipped = 0;
  let usdcImported = 0;
  let usdcSkipped = 0;

  if (mode === 'replace') {
    await db.withTransactionAsync(async () => {
      await db.execAsync('DELETE FROM usdc_positions; DELETE FROM positions;');
      for (const p of data.positions) {
        await insertPositionRow(db, p);
        positionsImported++;
      }
      for (const u of data.usdcPositions) {
        await insertUsdcRow(db, u);
        usdcImported++;
      }
    });
    return { positionsImported, positionsSkipped: 0, usdcImported, usdcSkipped: 0 };
  }

  // merge
  const positionIds = new Set(
    (await db.getAllAsync<{ id: string }>('SELECT id FROM positions')).map((r) => r.id),
  );

  for (const p of data.positions) {
    if (positionIds.has(p.id)) {
      positionsSkipped++;
      continue;
    }
    await insertPositionRow(db, p);
    positionIds.add(p.id);
    positionsImported++;
  }

  for (const u of data.usdcPositions) {
    const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM usdc_positions WHERE id = ?', [u.id]);
    if (exists) {
      usdcSkipped++;
      continue;
    }
    if (!positionIds.has(u.sourcePositionId)) {
      usdcSkipped++;
      continue;
    }
    await insertUsdcRow(db, u);
    usdcImported++;
  }

  return { positionsImported, positionsSkipped, usdcImported, usdcSkipped };
}
