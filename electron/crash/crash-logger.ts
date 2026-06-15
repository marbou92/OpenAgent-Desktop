/**
 * OpenAgent-Desktop Aether - Crash Logger
 * 
 * Writes a detailed crash.log file when the application crashes.
 * Uses synchronous writes and atomic rename for reliability during crashes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import type { CrashLogEntry, CrashLog } from './types';

export class CrashLogger {
  private crashLogPath: string;
  private tmpPath: string;
  private activeSubsystems: Set<string> = new Set();

  constructor(userDataPath: string) {
    this.crashLogPath = path.join(userDataPath, 'crash.log');
    this.tmpPath = path.join(userDataPath, 'crash.log.tmp');
  }

  registerSubsystem(name: string): void {
    this.activeSubsystems.add(name);
  }

  unregisterSubsystem(name: string): void {
    this.activeSubsystems.delete(name);
  }

  writeCrashLog(entry: CrashLogEntry, recentLogEntries: string[] = []): void {
    const crashLog: CrashLog = {
      timestamp: new Date().toISOString(),
      appVersion: app?.getVersion?.() ?? 'unknown',
      electronVersion: process.versions.electron ?? 'unknown',
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      error: entry,
      memoryUsage: process.memoryUsage(),
      uptimeMs: Math.round(process.uptime() * 1000),
      activeSubsystems: Array.from(this.activeSubsystems),
      recentLogEntries,
      userDataPath: app?.getPath?.('userData') ?? 'unknown',
    };

    try {
      // Atomic write: tmp then rename
      fs.writeFileSync(this.tmpPath, JSON.stringify(crashLog, null, 2), 'utf-8');
      fs.renameSync(this.tmpPath, this.crashLogPath);
    } catch (err) {
      // Last resort: try direct write
      try {
        fs.writeFileSync(this.crashLogPath, JSON.stringify(crashLog, null, 2), 'utf-8');
      } catch {
        console.error('[CrashLogger] Failed to write crash log:', err);
      }
    }
  }

  getCrashLogPath(): string {
    return this.crashLogPath;
  }
}
