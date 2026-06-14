/**
 * OpenAgent-Desktop - Database Module
 *
 * Exports the JSON-backed database connection manager, migration runner,
 * and the generic repository base class.
 *
 * Uses pure JavaScript JSON file storage — no native compilation required.
 */

export { getDatabase, getTable, closeDatabase, flushAll, JsonTable } from './connection';
export { runMigrations } from './migrations';
export { Repository } from './repository';
