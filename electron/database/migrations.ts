/**
 * OpenAgent-Desktop - Database Schema Migrations
 *
 * Manages database schema versioning and migration execution
 * using the JSON-backed storage layer.
 *
 * Each migration creates the necessary tables (JSON files) and
 * populates initial data.
 */

import { getTable, flushAll } from './connection';
import { logger } from '../utils/logger';

interface Migration {
  version: number;
  up: () => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: () => {
      // Creating a table in JSON storage simply means ensuring the file exists.
      // The getTable() call auto-creates the file on first write.
      // We create them explicitly so they exist even if empty.
      const tableNames = [
        'providers',
        'sessions',
        'messages',
        'memories',
        'extensions',
        'recipes',
        'permission_rules',
        'trace_entries',
      ];

      for (const name of tableNames) {
        getTable(name); // Ensures table is loaded/created
      }

      // Record schema version
      const schemaTable = getTable('schema_version');
      schemaTable.upsert({ id: 'current', version: 1 });
      flushAll();

      logger.info('Database', 'Migration v1 complete — created tables');
    },
  },
];

export function runMigrations(): void {
  const schemaTable = getTable('schema_version');
  const currentRow = schemaTable.get('current');
  const currentVersion = (currentRow?.version as number) ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      logger.info('Database', `Running migration v${migration.version}`);
      migration.up();
      schemaTable.upsert({ id: 'current', version: migration.version });
      flushAll();
      logger.info('Database', `Migration v${migration.version} complete`);
    }
  }
}
