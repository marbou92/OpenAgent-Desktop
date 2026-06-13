/**
 * OpenAgent-Desktop - Generic Repository Pattern
 *
 * Provides a base repository class for common database CRUD operations.
 * Subclass this for specific table repositories with custom queries.
 */

import Database from 'better-sqlite3';
import { getDatabase } from './connection';

export class Repository<T> {
  constructor(private tableName: string, private idColumn = 'id') {}

  protected get db(): Database.Database {
    return getDatabase();
  }

  findById(id: string): T | undefined {
    return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ?`).get(id) as T | undefined;
  }

  findAll(limit = 100, offset = 0): T[] {
    return this.db.prepare(`SELECT * FROM ${this.tableName} LIMIT ? OFFSET ?`).all(limit, offset) as T[];
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${this.idColumn} = ?`).run(id);
    return result.changes > 0;
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`).get() as any;
    return row?.count ?? 0;
  }

  transaction<R>(fn: () => R): R {
    return this.db.transaction(fn)();
  }
}
