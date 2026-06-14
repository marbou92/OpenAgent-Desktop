/**
 * OpenAgent-Desktop - JSON Database Connection Manager
 *
 * Pure JavaScript database layer using JSON file storage.
 * No native compilation required — works on all platforms (Windows, macOS, Linux).
 *
 * The "database" is a directory of JSON files, one per table/collection.
 * This avoids the need for native addons like better-sqlite3 that require
 * Visual Studio / Xcode / gcc on CI runners.
 */

import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

// ─── JSON Database Engine ──────────────────────────────────────────────────────

/** Represents a single JSON-backed table/collection */
export class JsonTable {
  private filePath: string;
  private rows: Map<string, Record<string, unknown>> = new Map();
  private dirty = false;

  constructor(
    private dataDir: string,
    private tableName: string,
  ) {
    this.filePath = path.join(dataDir, `${tableName}.json`);
  }

  /** Load rows from disk */
  load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.rows.clear();
          for (const row of data) {
            if (row.id !== null && row.id !== undefined) {
              this.rows.set(String(row.id), row);
            }
          }
        }
      }
    } catch {
      // Start fresh if file is corrupted
      this.rows.clear();
    }
  }

  /** Persist rows to disk */
  save(): void {
    if (!this.dirty) return;
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(Array.from(this.rows.values()), null, 2),
      'utf-8',
    );
    this.dirty = false;
  }

  /** Insert or replace a row by id */
  upsert(row: Record<string, unknown>): void {
    const id = String(row.id);
    this.rows.set(id, { ...row });
    this.dirty = true;
  }

  /** Get a row by id */
  get(id: string): Record<string, unknown> | undefined {
    return this.rows.get(id) ? { ...this.rows.get(id)! } : undefined;
  }

  /** Get all rows */
  getAll(): Record<string, unknown>[] {
    return Array.from(this.rows.values()).map((r) => ({ ...r }));
  }

  /** Delete a row by id */
  delete(id: string): boolean {
    const existed = this.rows.has(id);
    this.rows.delete(id);
    if (existed) this.dirty = true;
    return existed;
  }

  /** Count rows */
  count(): number {
    return this.rows.size;
  }

  /** Find rows matching a predicate */
  find(predicate: (row: Record<string, unknown>) => boolean): Record<string, unknown>[] {
    return this.getAll().filter(predicate);
  }

  /** Find first row matching a predicate */
  findOne(predicate: (row: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
    for (const row of this.rows.values()) {
      if (predicate(row)) return { ...row };
    }
    return undefined;
  }
}

// ─── Connection Manager ────────────────────────────────────────────────────────

let dataDir: string | null = null;
const tables: Map<string, JsonTable> = new Map();

/** Initialize the JSON database directory and return its path */
export function getDatabase(): string {
  if (dataDir) return dataDir;

  dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.openagent', 'db');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  logger.info('Database', 'JSON database initialized', { path: dataDir });
  return dataDir;
}

/** Get or create a table by name */
export function getTable(tableName: string): JsonTable {
  const dir = getDatabase();
  let table = tables.get(tableName);
  if (!table) {
    table = new JsonTable(dir, tableName);
    table.load();
    tables.set(tableName, table);
  }
  return table;
}

/** Flush all dirty tables to disk */
export function flushAll(): void {
  for (const table of tables.values()) {
    table.save();
  }
}

/** Close the database — flush everything and reset state */
export function closeDatabase(): void {
  flushAll();
  tables.clear();
  dataDir = null;
  logger.info('Database', 'Database closed');
}
