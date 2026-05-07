import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('dca-bot.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS price_cache (
      asset TEXT NOT NULL,
      date  TEXT NOT NULL,
      price REAL NOT NULL,
      PRIMARY KEY (asset, date)
    );

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
  `);
  return _db;
}
