/**
 * OpenAgent-Desktop - SQLite Database Connection Manager
 *
 * Provides a singleton database connection using better-sqlite3.
 * Stores the database file in the user's ~/.openagent directory.
 * Enables WAL mode for better concurrent read performance.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.openagent');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'openagent.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  logger.info('Database', 'Database initialized', { path: dbPath });
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database', 'Database closed');
  }
}
