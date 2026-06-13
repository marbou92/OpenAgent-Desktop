/**
 * OpenAgent-Desktop - Database Module
 *
 * Exports the database connection manager, migration runner,
 * and the generic repository base class.
 */

export { getDatabase, closeDatabase } from './connection';
export { runMigrations } from './migrations';
export { Repository } from './repository';
