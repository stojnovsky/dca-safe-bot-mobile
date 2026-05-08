import { getDb } from './db';
import type { RunResult } from './dca-runner';

export type BotRunSource = 'manual' | 'background';
export type BotRunStatus = 'ok' | 'error' | 'skipped';

export interface BotRunLog {
  id:        number;
  timestamp: string;
  source:    BotRunSource;
  status:    BotRunStatus;
  buys:      number;
  sells:     number;
  errors:    number;
  message:   string | null;
  details:   string | null;
}

interface DbRow {
  id:        number;
  timestamp: string;
  source:    string;
  status:    string;
  buys:      number;
  sells:     number;
  errors:    number;
  message:   string | null;
  details:   string | null;
}

export async function logBotRun(
  source: BotRunSource,
  result: RunResult,
): Promise<void> {
  const db = await getDb();
  const buys   = result.buys.length;
  const sells  = result.sells.length;
  const errors = result.errors.length;

  let status: BotRunStatus = 'ok';
  if (errors > 0 && buys === 0 && sells === 0) status = 'error';
  if (errors === 0 && buys === 0 && sells === 0) status = 'skipped';

  const message = buildSummary(result, status);

  await db.runAsync(
    `INSERT INTO bot_runs (timestamp, source, status, buys, sells, errors, message, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      new Date().toISOString(),
      source,
      status,
      buys,
      sells,
      errors,
      message,
      JSON.stringify(result),
    ],
  );

  await trim();
}

export async function logBotEvent(
  source: BotRunSource,
  status: BotRunStatus,
  message: string,
  details?: unknown,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO bot_runs (timestamp, source, status, buys, sells, errors, message, details)
     VALUES (?, ?, ?, 0, 0, 0, ?, ?)`,
    [
      new Date().toISOString(),
      source,
      status,
      message,
      details === undefined ? null : JSON.stringify(details),
    ],
  );
  await trim();
}

export async function getBotLogs(limit = 200): Promise<BotRunLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DbRow>(
    `SELECT id, timestamp, source, status, buys, sells, errors, message, details
     FROM bot_runs ORDER BY id DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toLog);
}

export async function clearBotLogs(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM bot_runs');
}

const MAX_ROWS = 1000;

async function trim(): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM bot_runs',
  );
  if ((row?.cnt ?? 0) > MAX_ROWS) {
    await db.runAsync(
      `DELETE FROM bot_runs WHERE id IN (
         SELECT id FROM bot_runs ORDER BY id ASC LIMIT ?
       )`,
      [(row?.cnt ?? 0) - MAX_ROWS],
    );
  }
}

function buildSummary(r: RunResult, status: BotRunStatus): string {
  if (status === 'skipped') return 'No action — nothing to buy or sell';
  const parts: string[] = [];
  if (r.buys.length)  parts.push(`${r.buys.length} buy${r.buys.length > 1 ? 's' : ''}`);
  if (r.sells.length) parts.push(`${r.sells.length} sell${r.sells.length > 1 ? 's' : ''}`);
  if (r.errors.length) parts.push(`${r.errors.length} error${r.errors.length > 1 ? 's' : ''}`);
  return parts.join(' · ') || 'No action';
}

function toLog(r: DbRow): BotRunLog {
  return {
    id:        r.id,
    timestamp: r.timestamp,
    source:    (r.source as BotRunSource),
    status:    (r.status as BotRunStatus),
    buys:      r.buys,
    sells:     r.sells,
    errors:    r.errors,
    message:   r.message,
    details:   r.details,
  };
}
