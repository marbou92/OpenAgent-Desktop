/**
 * OpenAgent-Desktop — SQLite Database Module (Phase 2.5)
 *
 * Uses `better-sqlite3` (native, fast) when available. Falls back to
 * JSON file storage when better-sqlite3 can't be installed (e.g. Windows 7
 * CI without Visual Studio C++ build tools, or Node < 20).
 *
 * The SessionManager already has try/catch fallbacks to JSON — this module
 * just needs to not crash on import.
 */

import * as fs from 'fs';
import * as path from 'path';

// Phase 2.5.1: Dynamic import — don't crash if better-sqlite3 isn't installed.
let Database: any = null;
try {
  Database = require('better-sqlite3');
} catch {
  // better-sqlite3 not available — app falls back to JSON storage.
  console.info('[Database] better-sqlite3 not available — using JSON file storage');
}

export interface DBSession {
  id: string;
  name: string;
  provider_id: string;
  model: string;
  project_id: string | null;
  working_directory: string | null;
  created_at: string;
  updated_at: string;
  metadata: string; // JSON string
}

export interface DBMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  thinking: string | null;
  timestamp: string;
  sort_order: number;
}

export interface DBToolCall {
  id: string;
  message_id: string;
  name: string;
  arguments: string; // JSON string
  result: string | null; // JSON string or text
  status: string;
  split_offset: number | null;
}

export interface DBTraceEntry {
  id: string;
  session_id: string;
  type: string;
  content: string;
  metadata: string | null; // JSON string
  timestamp: string;
}

let db: any = null;

/**
 * Initialize the database. Creates the file if it doesn't exist, creates
 * tables if they don't exist, and runs migration if needed.
 * Returns null if better-sqlite3 is not available (app falls back to JSON).
 */
export function initDatabase(dbPath: string): any | null {
  if (!Database) return null; // better-sqlite3 not installed

  // Ensure the directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Better concurrent read performance
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      provider_id TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      project_id TEXT,
      working_directory TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      thinking TEXT,
      timestamp TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      name TEXT NOT NULL,
      arguments TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      split_offset INTEGER,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trace_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      metadata TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      directory TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      extensions TEXT NOT NULL DEFAULT '[]',
      skills TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);
    CREATE INDEX IF NOT EXISTS idx_trace_session ON trace_entries(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
  `);

  return db;
}

/**
 * Get the database instance. Returns null if not initialized or unavailable.
 */
export function getDB(): any | null {
  if (!db) return null;
  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if the database has been initialized (tables exist).
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}
