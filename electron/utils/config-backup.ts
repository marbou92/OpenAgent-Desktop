/**
 * OpenAgent-Desktop - Config Backup & Recovery Utilities
 *
 * Provides rotating backup and safe recovery for configuration files.
 * Used by the main process to ensure that a corrupted config file never
 * results in total data loss.
 *
 * Features:
 * - Rotating backups: .bak, .bak.1, .bak.2 … .bak.(MAX_BACKUPS-1)
 * - Recovery: loads the first backup that parses as valid JSON
 * - Atomic write: write to .tmp then rename (with retry for Windows file locks)
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_BACKUPS = 5;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

// ─── Helper: synchronous sleep via busy-wait ───────────────────────────────────

function busyWait(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // intentional busy-wait for short delays
  }
}

// ─── Create a rotating backup ──────────────────────────────────────────────────

/**
 * Creates a rotating backup of the given file.
 * Rotates existing backups: .bak → .bak.1 → .bak.2 … and copies the current
 * file to .bak.  Oldest backups beyond MAX_BACKUPS are discarded.
 */
export function createBackup(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return; // Nothing to back up
  }

  // Remove the oldest backup if it exceeds the limit
  const oldestBackup = `${filePath}.bak.${MAX_BACKUPS - 1}`;
  try {
    if (fs.existsSync(oldestBackup)) {
      fs.unlinkSync(oldestBackup);
    }
  } catch {
    // Ignore — best-effort cleanup
  }

  // Rotate existing backups: .bak.(N-1) → .bak.N, … .bak.1 → .bak.2, .bak → .bak.1
  for (let i = MAX_BACKUPS - 2; i >= 1; i--) {
    const current = `${filePath}.bak.${i}`;
    const next = `${filePath}.bak.${i + 1}`;
    try {
      if (fs.existsSync(current)) {
        fs.renameSync(current, next);
      }
    } catch {
      // Ignore rotation failures — best-effort
    }
  }

  // Rotate .bak → .bak.1
  const primaryBackup = `${filePath}.bak`;
  try {
    if (fs.existsSync(primaryBackup)) {
      fs.renameSync(primaryBackup, `${filePath}.bak.1`);
    }
  } catch {
    // Ignore
  }

  // Copy the current file to .bak
  try {
    fs.copyFileSync(filePath, primaryBackup);
  } catch {
    // Ignore backup creation failure — non-critical
  }
}

// ─── Recover from backup ───────────────────────────────────────────────────────

/**
 * Attempts to recover configuration content from backup files.
 * Tries .bak first, then .bak.1, .bak.2, etc.
 * Returns the first backup's content that parses as valid JSON, or null if none.
 */
export function recoverFromBackup(filePath: string): string | null {
  // Try primary backup first
  const primaryBackup = `${filePath}.bak`;
  const content = tryReadValidJSON(primaryBackup);
  if (content !== null) {
    return content;
  }

  // Try numbered backups
  for (let i = 1; i < MAX_BACKUPS; i++) {
    const backupPath = `${filePath}.bak.${i}`;
    const backupContent = tryReadValidJSON(backupPath);
    if (backupContent !== null) {
      return backupContent;
    }
  }

  return null; // No valid backup found
}

// ─── Atomic JSON Write ─────────────────────────────────────────────────────────

/**
 * Writes JSON data to a file atomically using the write-then-rename pattern.
 * Retries up to MAX_RETRIES times with exponential backoff to handle Windows
 * file locks (particularly important for Windows 7).
 */
export function atomicWriteJSON(filePath: string, data: any): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to temporary file
      fs.writeFileSync(tmpPath, jsonStr, 'utf-8');

      // Atomic rename
      fs.renameSync(tmpPath, filePath);
      return; // Success
    } catch (err: any) {
      lastError = err;

      // Clean up temp file
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup errors
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[ConfigBackup] atomicWriteJSON failed (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
            `retrying in ${delay}ms... Error: ${err.message}`
        );
        busyWait(delay);
      }
    }
  }

  throw lastError;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Attempts to read a file and return its content if it contains valid JSON.
 * Returns null if the file doesn't exist, can't be read, or contains invalid JSON.
 */
function tryReadValidJSON(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content); // Validate
    return content;
  } catch {
    return null;
  }
}
