import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./hook-bank.js";
export { schema };

const here = path.dirname(fileURLToPath(import.meta.url));
/** growth-engine/growth.sqlite regardless of where the process starts */
export const DB_PATH = path.join(here, "..", "..", "..", "growth.sqlite");

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}
