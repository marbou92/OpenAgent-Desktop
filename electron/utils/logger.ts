/**
 * OpenAgent-Desktop - Structured Logger with Rotation
 *
 * Provides a file-based logging system with automatic log rotation.
 * Designed for robustness on Windows 7 and other platforms where
 * file system operations may be slow or unreliable.
 *
 * Features:
 * - Leveled logging (DEBUG, INFO, WARN, ERROR)
 * - Module-scoped log messages for easy filtering
 * - Automatic log file rotation when files exceed max size
 * - Configurable retention of rotated log files
 * - Synchronous writes to guarantee log delivery on crash
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Log Level ────────────────────────────────────────────────────────────────

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// ─── Logger Class ─────────────────────────────────────────────────────────────

export class Logger {
  private logDir: string;
  private currentLogFile: string;
  private maxFileSize: number;
  private maxFiles: number;
  private level: LogLevel;
  private initialized = false;

  constructor(options: { logDir: string; level?: LogLevel }) {
    this.logDir = options.logDir;
    this.level = options.level ?? LogLevel.INFO;
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.maxFiles = 5;

    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.currentLogFile = path.join(this.logDir, `app-${dateStr}.log`);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  debug(module: string, message: string, data?: any): void {
    this.write('DEBUG', module, message, data);
  }

  info(module: string, message: string, data?: any): void {
    this.write('INFO', module, message, data);
  }

  warn(module: string, message: string, data?: any): void {
    this.write('WARN', module, message, data);
  }

  error(module: string, message: string, error?: any): void {
    this.write('ERROR', module, message, error);
  }

  /**
   * Initialize the logger by ensuring the log directory exists.
   * Must be called before any logging (or logs will be silently dropped).
   */
  init(): void {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.initialized = true;

      // Log the initialization itself
      this.info('Logger', `Logger initialized at ${this.logDir}, level=${LogLevel[this.level]}`);
    } catch (err) {
      // If we can't create the log directory, fall back to console only
      console.error('[Logger] Failed to initialize log directory:', err);
    }
  }

  /**
   * Check if the logger has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private write(level: string, module: string, message: string, data?: any): void {
    // Check log level
    const numericLevel = this.levelFromString(level);
    if (numericLevel < this.level) return;

    const timestamp = new Date().toISOString();
    const dataStr = data !== undefined ? ' ' + this.serializeData(data) : '';
    const logLine = `[${timestamp}] [${level}] [${module}] ${message}${dataStr}\n`;

    // Always write to console as well
    switch (level) {
      case 'DEBUG':
        console.debug(logLine.trimEnd());
        break;
      case 'INFO':
        console.info(logLine.trimEnd());
        break;
      case 'WARN':
        console.warn(logLine.trimEnd());
        break;
      case 'ERROR':
        console.error(logLine.trimEnd());
        break;
    }

    // Write to file if initialized
    if (!this.initialized) return;

    try {
      // Rotate if necessary
      this.rotateIfNeeded();

      // Append to the current log file
      fs.appendFileSync(this.currentLogFile, logLine, 'utf-8');
    } catch (err) {
      // If file write fails, we've already logged to console
      console.error('[Logger] Failed to write to log file:', err);
    }
  }

  private levelFromString(level: string): LogLevel {
    switch (level) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.DEBUG;
    }
  }

  private serializeData(data: any): string {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';

    if (data instanceof Error) {
      return JSON.stringify({
        name: data.name,
        message: data.message,
        stack: data.stack,
      });
    }

    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.currentLogFile)) return;

      const stats = fs.statSync(this.currentLogFile);
      if (stats.size < this.maxFileSize) return;

      // Perform rotation
      this.rotateLogFiles();
    } catch (err) {
      // If we can't check file size, just keep writing
      console.warn('[Logger] Could not check log file size for rotation:', err);
    }
  }

  private rotateLogFiles(): void {
    // Remove the oldest rotated file if it exists
    const oldestFile = `${this.currentLogFile}.${this.maxFiles - 1}`;
    try {
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }
    } catch {
      // Best-effort cleanup
    }

    // Shift rotated files: .1 -> .2, .2 -> .3, etc.
    for (let i = this.maxFiles - 2; i >= 1; i--) {
      const current = `${this.currentLogFile}.${i}`;
      const next = `${this.currentLogFile}.${i + 1}`;
      try {
        if (fs.existsSync(current)) {
          fs.renameSync(current, next);
        }
      } catch {
        // Best-effort rotation
      }
    }

    // Rename current log file to .1
    try {
      fs.renameSync(this.currentLogFile, `${this.currentLogFile}.1`);
    } catch (err) {
      console.warn('[Logger] Failed to rotate current log file:', err);
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

/**
 * Default logger instance. Before `initializeLogger` is called, logs go to
 * console only. After initialization, logs are also written to files.
 */
export const logger = new Logger({ logDir: '' });

/**
 * Initialize the global logger with a real log directory and optional level.
 * This should be called once during app startup, before any subsystem init.
 */
export function initializeLogger(logDir: string, level?: LogLevel): void {
  // Replace the singleton's properties by re-assigning internals
  (logger as any).logDir = logDir;

  const dateStr = new Date().toISOString().split('T')[0];
  (logger as any).currentLogFile = path.join(logDir, `app-${dateStr}.log`);

  if (level !== undefined) {
    (logger as any).level = level;
  }

  logger.init();
}
