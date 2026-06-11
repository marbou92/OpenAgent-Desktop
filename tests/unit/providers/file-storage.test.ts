import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileStorageAdapter } from '../../../electron/providers/file-storage';

describe('FileStorageAdapter', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openagent-test-'));
    filePath = path.join(tempDir, 'test-storage.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create a new file on first set', () => {
    const storage = new FileStorageAdapter(filePath);
    storage.set('key', 'value');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should persist and retrieve values', () => {
    const storage1 = new FileStorageAdapter(filePath);
    storage1.set('providers', [{ id: 'test', name: 'TestProvider' }]);
    storage1.flush();

    const storage2 = new FileStorageAdapter(filePath);
    expect(storage2.get('providers')).toEqual([{ id: 'test', name: 'TestProvider' }]);
  });

  it('should return undefined for missing keys', () => {
    const storage = new FileStorageAdapter(filePath);
    expect(storage.get('nonexistent')).toBeUndefined();
  });

  it('should return defaultValue for missing keys', () => {
    const storage = new FileStorageAdapter(filePath);
    expect(storage.get('missing', 'default')).toBe('default');
  });

  it('should delete keys', () => {
    const storage = new FileStorageAdapter(filePath);
    storage.set('key', 'value');
    storage.delete('key');
    expect(storage.get('key')).toBeUndefined();
  });

  it('should clear all data', () => {
    const storage = new FileStorageAdapter(filePath);
    storage.set('a', 1);
    storage.set('b', 2);
    storage.clear();
    expect(storage.get('a')).toBeUndefined();
    expect(storage.get('b')).toBeUndefined();
  });

  it('should handle corrupt files gracefully', () => {
    fs.writeFileSync(filePath, '{ invalid json');
    const storage = new FileStorageAdapter(filePath);
    expect(storage.get('anything')).toBeUndefined();
  });

  it('should handle missing files gracefully', () => {
    const missingPath = path.join(tempDir, 'nonexistent', 'storage.json');
    const storage = new FileStorageAdapter(missingPath);
    storage.set('key', 'value');
    expect(storage.get('key')).toBe('value');
  });
});
