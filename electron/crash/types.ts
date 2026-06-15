/**
 * OpenAgent-Desktop Aether - Crash Logger Types
 */

export type CrashErrorType = 'uncaughtException' | 'unhandledRejection' | 'SIGTERM' | 'SIGINT';

export interface CrashLogEntry {
  timestamp: string;
  errorType: CrashErrorType;
  errorName: string;
  errorMessage: string;
  stackTrace: string;
}

export interface CrashLog {
  timestamp: string;
  appVersion: string;
  electronVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
  error: CrashLogEntry;
  memoryUsage: NodeJS.MemoryUsage;
  uptimeMs: number;
  activeSubsystems: string[];
  recentLogEntries: string[];
  userDataPath: string;
}

export interface CrashLogInfo {
  exists: boolean;
  timestamp?: string;
  errorType?: string;
  errorMessage?: string;
  filePath?: string;
}
