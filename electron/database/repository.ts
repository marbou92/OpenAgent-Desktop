/**
 * OpenAgent-Desktop - Generic Repository Pattern
 *
 * Provides a base repository class for common CRUD operations
 * using the JSON-backed storage layer.
 * Subclass this for specific table repositories with custom queries.
 */

import { getTable, flushAll, JsonTable } from './connection';

export class Repository<T extends { id: string }> {
  protected table: JsonTable;

  constructor(tableName: string) {
    this.table = getTable(tableName);
  }

  findById(id: string): T | undefined {
    const row = this.table.get(id);
    return row as T | undefined;
  }

  findAll(limit = 100, offset = 0): T[] {
    const all = this.table.getAll() as T[];
    return all.slice(offset, offset + limit);
  }

  upsert(entity: T): void {
    this.table.upsert(entity as Record<string, unknown>);
    flushAll();
  }

  deleteById(id: string): boolean {
    const result = this.table.delete(id);
    flushAll();
    return result;
  }

  count(): number {
    return this.table.count();
  }

  find(predicate: (row: T) => boolean): T[] {
    return this.table.find((row) => predicate(row as T)) as T[];
  }

  findOne(predicate: (row: T) => boolean): T | undefined {
    return this.table.findOne((row) => predicate(row as T)) as T | undefined;
  }
}
