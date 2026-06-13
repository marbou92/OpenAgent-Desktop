/**
 * OpenAgent-Desktop - Database Schema Migrations
 *
 * Manages database schema versioning and migration execution.
 * Each migration is identified by a version number and contains
 * the SQL statements to upgrade the schema.
 */

import Database from 'better-sqlite3';
import { getDatabase } from './connection';
import { logger } from '../utils/logger';

const MIGRATIONS: { version: number; up: (db: Database.Database) => void }[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          config TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider_id TEXT,
          model TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          messages_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT,
          thinking TEXT,
          tool_calls TEXT,
          files TEXT,
          timestamp TEXT NOT NULL,
          is_streaming INTEGER DEFAULT 0,
          error TEXT,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          category TEXT,
          key TEXT,
          value TEXT NOT NULL,
          embedding BLOB,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type, category);

        CREATE TABLE IF NOT EXISTS extensions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          version TEXT,
          config TEXT,
          status TEXT DEFAULT 'installed',
          installed_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL,
          variables TEXT,
          schedule TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS permission_rules (
          id TEXT PRIMARY KEY,
          agent_mode TEXT NOT NULL,
          pattern TEXT NOT NULL,
          level TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_permission_rules_agent ON permission_rules(agent_mode);

        CREATE TABLE IF NOT EXISTS trace_entries (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT,
          timestamp TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_trace_session ON trace_entries(session_id, timestamp);

        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY
        );
        INSERT INTO schema_version VALUES (1);
      `);
    },
  },
];

export function runMigrations(): void {
  const db = getDatabase();

  let currentVersion = 0;
  try {
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any;
    currentVersion = row?.v ?? 0;
  } catch {
    // Table doesn't exist yet, start from 0
  }

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      logger.info('Database', `Running migration v${migration.version}`);
      migration.up(db);
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(migration.version);
      logger.info('Database', `Migration v${migration.version} complete`);
    }
  }
}
