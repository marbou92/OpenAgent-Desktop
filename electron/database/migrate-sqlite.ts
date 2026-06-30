/**
 * OpenAgent-Desktop — SQLite Migration (Phase 2.5)
 *
 * Migrates existing JSON session files into the SQLite database.
 * Runs on first launch when the database is empty.
 *
 * Scans the sessions directory for *.session.json files, reads each one,
 * and inserts the session + its messages + tool calls into SQLite.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDB } from './sqlite';
import type { Database } from 'better-sqlite3';

interface LegacySession {
  id: string;
  name: string;
  providerId: string;
  model: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    thinking?: string;
    timestamp: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      result?: unknown;
      status: string;
      _splitOffset?: number;
    }>;
  }>;
  extensions: string[];
  recipes: string[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  projectId?: string | null;
  workingDirectory?: string;
}

export function migrateJsonToSqlite(sessionsDir: string): number {
  const db = getDB();

  // Check if migration is needed (database has no sessions)
  const count = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
  if (count.c > 0) return 0; // Already has data — skip migration

  if (!fs.existsSync(sessionsDir)) return 0;

  const files = fs.readdirSync(sessionsDir);
  let migrated = 0;

  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (id, name, provider_id, model, project_id, working_directory, created_at, updated_at, metadata)
    VALUES (@id, @name, @provider_id, @model, @project_id, @working_directory, @created_at, @updated_at, @metadata)
  `);

  const insertMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (id, session_id, role, content, thinking, timestamp, sort_order)
    VALUES (@id, @session_id, @role, @content, @thinking, @timestamp, @sort_order)
  `);

  const insertToolCall = db.prepare(`
    INSERT OR REPLACE INTO tool_calls (id, message_id, name, arguments, result, status, split_offset)
    VALUES (@id, @message_id, @name, @arguments, @result, @status, @split_offset)
  `);

  for (const file of files) {
    if (!file.endsWith('.session.json')) continue;
    if (file.endsWith('.template.json')) continue;

    const filePath = path.join(sessionsDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const session: LegacySession = JSON.parse(raw);

      if (session.metadata?.isTemplate) continue;

      const migrateOne = db.transaction(() => {
        // Insert session
        insertSession.run({
          id: session.id,
          name: session.name || '',
          provider_id: session.providerId || '',
          model: session.model || '',
          project_id: session.projectId ?? null,
          working_directory: session.workingDirectory ?? null,
          created_at: session.createdAt,
          updated_at: session.updatedAt,
          metadata: JSON.stringify(session.metadata || {}),
        });

        // Insert messages + tool calls
        let sortOrder = 0;
        for (const msg of session.messages || []) {
          insertMessage.run({
            id: msg.id,
            session_id: session.id,
            role: msg.role,
            content: msg.content || '',
            thinking: msg.thinking || null,
            timestamp: msg.timestamp,
            sort_order: sortOrder++,
          });

          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              insertToolCall.run({
                id: tc.id,
                message_id: msg.id,
                name: tc.name,
                arguments: JSON.stringify(tc.arguments || {}),
                result: tc.result !== undefined ? (typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)) : null,
                status: tc.status || 'completed',
                split_offset: tc._splitOffset ?? null,
              });
            }
          }
        }
      });

      migrateOne();
      migrated++;
    } catch (err) {
      console.error(`[Migration] Failed to migrate ${file}:`, err);
    }
  }

  console.info(`[Migration] Migrated ${migrated} sessions from JSON to SQLite`);
  return migrated;
}
