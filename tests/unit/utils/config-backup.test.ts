import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createBackup, recoverFromBackup, atomicWriteJSON } from '../../../electron/utils/config-backup';

describe('Config Backup Utils', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openagent-backup-test-'));
    filePath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create backup file', () => {
    fs.writeFileSync(filePath, JSON.stringify({ test: true }));
    createBackup(filePath);
    expect(fs.existsSync(filePath + '.bak')).toBe(true);
  });

  it('should recover from backup', () => {
    const data = JSON.stringify({ recovered: true });
    fs.writeFileSync(filePath + '.bak', data);

    const recovered = recoverFromBackup(filePath);
    expect(recovered).toBe(data);
  });

  it('should return null when no backup exists', () => {
    const recovered = recoverFromBackup(filePath);
    expect(recovered).toBeNull();
  });

  it('should write JSON atomically', () => {
    atomicWriteJSON(filePath, { atomic: true });
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ atomic: true });
  });

  it('should rotate backups', () => {
    for (let i = 0; i < 7; i++) {
      fs.writeFileSync(filePath, JSON.stringify({ version: i }));
      createBackup(filePath);
    }
    // Should keep at most 5 backup files (.bak through .bak.4)
    const backupFiles = fs.readdirSync(tempDir).filter(f => f.includes('.bak'));
    expect(backupFiles.length).toBeLessThanOrEqual(6); // .bak + .bak.1 through .bak.4 + original
  });
});
