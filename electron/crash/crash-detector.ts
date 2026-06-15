/**
 * OpenAgent-Desktop Aether - Crash Detector
 * 
 * Detects and manages crash.log files from previous sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CrashLog, CrashLogInfo } from './types';

export class CrashDetector {
  private crashLogPath: string;
  private archivedPath: string;

  constructor(userDataPath: string) {
    this.crashLogPath = path.join(userDataPath, 'crash.log');
    this.archivedPath = path.join(userDataPath, 'crash.log.archived');
  }

  detect(): CrashLogInfo | null {
    if (!fs.existsSync(this.crashLogPath)) return null;
    try {
      const raw = fs.readFileSync(this.crashLogPath, 'utf-8');
      const log: CrashLog = JSON.parse(raw);
      return {
        exists: true,
        timestamp: log.timestamp,
        errorType: log.error.errorType,
        errorMessage: log.error.errorMessage,
        filePath: this.crashLogPath,
      };
    } catch {
      return { exists: true, filePath: this.crashLogPath };
    }
  }

  getLog(): CrashLog | null {
    if (!fs.existsSync(this.crashLogPath)) return null;
    try {
      const raw = fs.readFileSync(this.crashLogPath, 'utf-8');
      return JSON.parse(raw) as CrashLog;
    } catch {
      return null;
    }
  }

  dismiss(): void {
    try {
      if (fs.existsSync(this.archivedPath)) fs.unlinkSync(this.archivedPath);
      fs.renameSync(this.crashLogPath, this.archivedPath);
    } catch {
      // Best effort
    }
  }

  getArchivedLogs(maxCount = 5): CrashLogInfo[] {
    // In the future, we could support multiple archived crash logs
    // For now, just check the single archived file
    const results: CrashLogInfo[] = [];
    if (fs.existsSync(this.archivedPath)) {
      try {
        const raw = fs.readFileSync(this.archivedPath, 'utf-8');
        const log: CrashLog = JSON.parse(raw);
        results.push({
          exists: true,
          timestamp: log.timestamp,
          errorType: log.error.errorType,
          errorMessage: log.error.errorMessage,
          filePath: this.archivedPath,
        });
      } catch {
        results.push({ exists: true, filePath: this.archivedPath });
      }
    }
    return results.slice(0, maxCount);
  }
}
