import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;
/** Single-flight open: parallel callers must await the same init (avoids Android NPE in prepareAsync). */
let _opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('dca-bot.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    DROP TABLE IF EXISTS price_cache;

    CREATE TABLE IF NOT EXISTS positions (
      id            TEXT PRIMARY KEY,
      asset         TEXT NOT NULL,
      buy_date      TEXT NOT NULL,
      buy_price     REAL NOT NULL,
      usdc_invested REAL NOT NULL,
      asset_amount  REAL NOT NULL,
      buy_tx_hash   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'OPEN',
      sell_date     TEXT,
      sell_price    REAL,
      usdc_received REAL,
      sell_tx_hash  TEXT,
      profit_usd    REAL,
      profit_pct    REAL
    );

    CREATE TABLE IF NOT EXISTS usdc_positions (
      id                   TEXT PRIMARY KEY,
      source_asset         TEXT NOT NULL,
      source_position_id   TEXT NOT NULL,
      create_date          TEXT NOT NULL,
      sell_price           REAL NOT NULL,
      usdc_amount          REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_runs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      source    TEXT NOT NULL,
      status    TEXT NOT NULL,
      buys      INTEGER NOT NULL DEFAULT 0,
      sells     INTEGER NOT NULL DEFAULT 0,
      errors    INTEGER NOT NULL DEFAULT 0,
      message   TEXT,
      details   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bot_runs_ts ON bot_runs(timestamp DESC);
  `);
  try {
    await db.execAsync('ALTER TABLE positions ADD COLUMN close_reason TEXT;');
  } catch {
    /* column already exists */
  }
  try {
    await db.execAsync('ALTER TABLE positions ADD COLUMN lifecycle_json TEXT;');
  } catch {
    /* column already exists */
  }
  return db;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_opening) {
    _opening = openAndMigrate().then((db) => {
      _db = db;
      return db;
    });
  }
  try {
    return await _opening;
  } catch (e) {
    _opening = null;
    _db = null;
    throw e;
  }
}
