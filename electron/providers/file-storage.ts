/**
 * OpenAgent-Desktop Aether - File Storage Adapter
 *
 * Simple JSON file-based key-value storage for provider configurations
 * and other persisted data. Supports atomic writes, corruption recovery,
 * and safe creation of nested directories.
 */

import * as fs from 'fs';
import * as path from 'path';

export class FileStorageAdapter {
  private filePath: string;
  private data: Map<string, any> = new Map();
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            this.data.set(key, value);
          }
        }
      }
    } catch {
      // Corrupt or missing file — start with empty data
      this.data = new Map();
    }
    this.loaded = true;
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  get<T = any>(key: string, defaultValue?: T): T | undefined {
    if (this.data.has(key)) {
      return this.data.get(key) as T;
    }
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.data.set(key, value);
    this.flush();
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  clear(): void {
    this.data.clear();
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }

  flush(): void {
    this.ensureDir();
    const obj: Record<string, any> = {};
    for (const [key, value] of this.data.entries()) {
      obj[key] = value;
    }

    // Atomic write: write to temp file, then rename
    const tmpPath = this.filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
    try {
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      // Fallback: direct write if rename fails (e.g., cross-device)
      try {
        fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      } catch {
        // Best effort
      }
    }
  }

  reload(): void {
    this.data.clear();
    this.load();
  }

  getFilePath(): string {
    return this.filePath;
  }

  toJSON(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of this.data.entries()) {
      obj[key] = value;
    }
    return obj;
  }
}
