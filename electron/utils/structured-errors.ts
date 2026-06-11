/**
 * OpenAgent-Desktop - Structured Error Code System
 *
 * Provides a unified error taxonomy for the application. Every recoverable
 * error path produces a StructuredError with:
 *   - A machine-readable error code
 *   - A developer-facing message
 *   - A user-friendly message safe for UI display
 *   - Optional context data for debugging
 *
 * Usage:
 *   import { createError, ErrorCode, getUserMessage } from './structured-errors';
 *   const err = createError(ErrorCode.PERSIST_WRITE_FAILED, 'Failed to write config.json', { path: '/some/path' });
 *   console.log(getUserMessage(err)); // → "Could not save your settings. Please check file permissions."
 */

// ─── Error Codes ──────────────────────────────────────────────────────────────

export enum ErrorCode {
  // Persistence errors
  PERSIST_WRITE_FAILED = 'PERSIST_WRITE_FAILED',
  PERSIST_READ_FAILED = 'PERSIST_READ_FAILED',
  PERSIST_CORRUPT_DATA = 'PERSIST_CORRUPT_DATA',
  PERSIST_BACKUP_FAILED = 'PERSIST_BACKUP_FAILED',

  // Provider errors
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
  PROVIDER_AUTH_INVALID = 'PROVIDER_AUTH_INVALID',
  PROVIDER_CONNECTION_FAILED = 'PROVIDER_CONNECTION_FAILED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',

  // Extension errors
  EXTENSION_LOAD_ERROR = 'EXTENSION_LOAD_ERROR',
  EXTENSION_INSTALL_FAILED = 'EXTENSION_INSTALL_FAILED',

  // System errors
  DIR_CREATE_FAILED = 'DIR_CREATE_FAILED',
  FILE_PERMISSION_DENIED = 'FILE_PERMISSION_DENIED',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',

  // General
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ─── Structured Error Interface ───────────────────────────────────────────────

export interface StructuredError {
  code: ErrorCode;
  message: string;
  userMessage: string; // Human-readable for UI display
  context?: Record<string, unknown>;
  timestamp: number;
}

// ─── User Message Map ─────────────────────────────────────────────────────────

const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.PERSIST_WRITE_FAILED]: 'Could not save your settings. Please check file permissions.',
  [ErrorCode.PERSIST_READ_FAILED]: 'Could not read your settings. The file may be locked or missing.',
  [ErrorCode.PERSIST_CORRUPT_DATA]: 'Your settings file is corrupted. A backup will be restored if available.',
  [ErrorCode.PERSIST_BACKUP_FAILED]: 'Could not create a backup of your settings.',

  [ErrorCode.PROVIDER_NOT_FOUND]: 'The requested AI provider could not be found.',
  [ErrorCode.PROVIDER_AUTH_INVALID]: 'Your API key or authentication is invalid. Please check your credentials.',
  [ErrorCode.PROVIDER_CONNECTION_FAILED]: 'Could not connect to the AI provider. Please check your internet connection.',
  [ErrorCode.PROVIDER_TIMEOUT]: 'The AI provider took too long to respond. Please try again.',

  [ErrorCode.EXTENSION_LOAD_ERROR]: 'An extension failed to load. It may be incompatible or corrupted.',
  [ErrorCode.EXTENSION_INSTALL_FAILED]: 'Could not install the extension. Please check the source and try again.',

  [ErrorCode.DIR_CREATE_FAILED]: 'Could not create a required directory. Please check file permissions.',
  [ErrorCode.FILE_PERMISSION_DENIED]: 'Permission denied. Please check that you have access to the required files.',
  [ErrorCode.CONFIG_VALIDATION_FAILED]: 'Your configuration contains invalid values. Please review your settings.',

  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a structured error with a code, developer message, and auto-generated
 * user-friendly message. Optional context is attached for debugging.
 */
export function createError(
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>
): StructuredError {
  return {
    code,
    message,
    userMessage: USER_MESSAGES[code] || USER_MESSAGES[ErrorCode.UNKNOWN_ERROR],
    context,
    timestamp: Date.now(),
  };
}

// ─── User Message Helper ──────────────────────────────────────────────────────

/**
 * Extract a user-friendly message from any error-like value.
 * If the value is a StructuredError, returns its userMessage.
 * Otherwise, returns a generic fallback.
 */
export function getUserMessage(error: StructuredError | any): string {
  if (error && typeof error === 'object' && 'code' in error && 'userMessage' in error) {
    return error.userMessage as string;
  }

  if (error instanceof Error) {
    return error.message || USER_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }

  if (typeof error === 'string') {
    return error || USER_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }

  return USER_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

// ─── Error Code from System Error ─────────────────────────────────────────────

/**
 * Map a Node.js / OS error code (like 'EACCES', 'ENOENT') to an
 * application ErrorCode. Useful when wrapping filesystem errors.
 */
export function fromSystemError(err: any): ErrorCode {
  if (err && typeof err === 'object' && 'code' in err) {
    const sysCode = err.code as string;
    switch (sysCode) {
      case 'EACCES':
      case 'EPERM':
        return ErrorCode.FILE_PERMISSION_DENIED;
      case 'ENOENT':
        return ErrorCode.PERSIST_READ_FAILED;
      case 'EEXIST':
        return ErrorCode.DIR_CREATE_FAILED;
      case 'ECONNREFUSED':
      case 'ECONNRESET':
      case 'ENOTFOUND':
        return ErrorCode.PROVIDER_CONNECTION_FAILED;
      case 'ETIMEDOUT':
        return ErrorCode.PROVIDER_TIMEOUT;
      case 'ENOSPC':
        return ErrorCode.PERSIST_WRITE_FAILED;
      default:
        break;
    }
  }

  return ErrorCode.UNKNOWN_ERROR;
}
