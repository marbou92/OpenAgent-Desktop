/**
 * OpenAgent-Desktop - Thinking Trace Collector
 *
 * Captures AI thinking process steps in real-time.
 * Each trace entry captures the AI's reasoning, actions, tool calls,
 * and results throughout a session.
 *
 * Features:
 * - Real-time trace capture with streaming subscription (EventEmitter)
 * - Per-session append-only log files
 * - Auto-rotation of old trace files
 * - Search and filter traces
 * - Export traces as JSON or Markdown
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type TraceEntryType =
  | "thinking"
  | "action"
  | "tool_call"
  | "tool_result"
  | "error"
  | "info";

export interface TraceEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  type: TraceEntryType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface TraceFileHeader {
  version: string;
  sessionId: string;
  startedAt: string;
  entryCount: number;
}

export interface TraceSearchOptions {
  type?: TraceEntryType;
  types?: TraceEntryType[];
  contentContains?: string;
  metadataFilter?: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface TraceExportOptions {
  format: "json" | "markdown";
  includeMetadata?: boolean;
  contentMaxLength?: number;
}

export interface TraceCollectorOptions {
  tracesDir: string;
  maxFileAgeDays?: number;
  maxFileSizeMB?: number;
  enabled?: boolean;
  bufferSize?: number;
  flushIntervalMs?: number;
}

interface SessionTraceState {
  sessionId: string;
  filePath: string;
  writeStream: fs.WriteStream | null;
  entryCount: number;
  startedAt: string;
  lastFlushedAt: string;
  buffer: TraceEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRACE_FILE_VERSION = "1.0.0";
const DEFAULT_MAX_FILE_AGE_DAYS = 30;
const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_BUFFER_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const TRACE_FILE_EXTENSION = ".trace";

// ─── TraceCollector ───────────────────────────────────────────────────────────

export class TraceCollector extends EventEmitter {
  private tracesDir: string;
  private maxFileAgeDays: number;
  private maxFileSizeMB: number;
  private enabled: boolean;
  private bufferSize: number;
  private flushIntervalMs: number;

  private activeSessions: Map<string, SessionTraceState> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(options: TraceCollectorOptions) {
    super();

    this.tracesDir = options.tracesDir;
    this.maxFileAgeDays = options.maxFileAgeDays || DEFAULT_MAX_FILE_AGE_DAYS;
    this.maxFileSizeMB = options.maxFileSizeMB || DEFAULT_MAX_FILE_SIZE_MB;
    this.enabled = options.enabled !== false;
    this.bufferSize = options.bufferSize || DEFAULT_BUFFER_SIZE;
    this.flushIntervalMs = options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure traces directory exists
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
    }

    // Start periodic flush
    this.flushTimer = setInterval(() => {
      this.flushAllBuffers();
    }, this.flushIntervalMs);

    // Start periodic rotation check
    this.rotationTimer = setInterval(() => {
      this.rotateOldFiles().catch((err) => {
        console.error("[TraceCollector] Rotation error:", err);
      });
    }, 60 * 60 * 1000); // Check every hour

    // Run initial rotation
    await this.rotateOldFiles();

    this.initialized = true;
    console.info("[TraceCollector] Initialized");
  }

  // ─── Session Management ──────────────────────────────────────────────────

  async startSession(sessionId: string): Promise<void> {
    if (!this.enabled) return;

    if (this.activeSessions.has(sessionId)) {
      // Session already active, just return
      return;
    }

    const filePath = this.getTraceFilePath(sessionId);
    const now = new Date().toISOString();

    const state: SessionTraceState = {
      sessionId,
      filePath,
      writeStream: null,
      entryCount: 0,
      startedAt: now,
      lastFlushedAt: now,
      buffer: [],
    };

    // Write the file header if the file is new
    if (!fs.existsSync(filePath)) {
      const header: TraceFileHeader = {
        version: TRACE_FILE_VERSION,
        sessionId,
        startedAt: now,
        entryCount: 0,
      };

      fs.writeFileSync(filePath, JSON.stringify(header) + "\n", "utf-8");
    } else {
      // Count existing entries
      state.entryCount = await this.countExistingEntries(filePath);
    }

    // Open write stream in append mode
    state.writeStream = fs.createWriteStream(filePath, {
      flags: "a",
      encoding: "utf-8",
    });

    state.writeStream.on("error", (err) => {
      console.error(`[TraceCollector] Write stream error for ${sessionId}:`, err);
      this.emit("error", err);
    });

    this.activeSessions.set(sessionId, state);

    // Add a session-start entry
    await this.addEntry(sessionId, {
      type: "info",
      content: "Trace session started",
      metadata: { event: "session_start" },
    });
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.activeSessions.get(sessionId);
    if (!state) return;

    // Add a session-end entry
    await this.addEntry(sessionId, {
      type: "info",
      content: "Trace session stopped",
      metadata: {
        event: "session_stop",
        totalEntries: state.entryCount,
        duration: Date.now() - new Date(state.startedAt).getTime(),
      },
    });

    // Flush remaining buffer
    await this.flushBuffer(sessionId);

    // Close the write stream
    if (state.writeStream) {
      state.writeStream.end();
      state.writeStream = null;
    }

    // Update the file header with final entry count
    await this.updateFileHeader(state.filePath, sessionId, state.entryCount);

    this.activeSessions.delete(sessionId);
  }

  // ─── Adding Entries ──────────────────────────────────────────────────────

  async addEntry(
    sessionId: string,
    entry: {
      type: TraceEntryType;
      content: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<TraceEntry> {
    if (!this.enabled) {
      // Return a dummy entry
      return {
        id: crypto.randomUUID(),
        sessionId,
        timestamp: new Date().toISOString(),
        type: entry.type,
        content: entry.content,
        metadata: entry.metadata,
      };
    }

    // Ensure session is active
    if (!this.activeSessions.has(sessionId)) {
      await this.startSession(sessionId);
    }

    const state = this.activeSessions.get(sessionId)!;

    const traceEntry: TraceEntry = {
      id: crypto.randomUUID(),
      sessionId,
      timestamp: new Date().toISOString(),
      type: entry.type,
      content: entry.content,
      metadata: entry.metadata,
    };

    state.entryCount++;
    state.buffer.push(traceEntry);

    // Emit for real-time subscribers
    this.emit("entry", traceEntry);

    // Flush if buffer is full
    if (state.buffer.length >= this.bufferSize) {
      await this.flushBuffer(sessionId);
    }

    return traceEntry;
  }

  // ─── Retrieving Traces ───────────────────────────────────────────────────

  async getTraces(
    sessionId: string,
    options?: TraceSearchOptions
  ): Promise<TraceEntry[]> {
    const filePath = this.getTraceFilePath(sessionId);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    // Flush any buffered entries for this session first
    await this.flushBuffer(sessionId);

    const entries = await this.readTraceFile(filePath);
    return this.filterEntries(entries, options);
  }

  async searchAcrossSessions(
    options: TraceSearchOptions & { sessionIds?: string[] }
  ): Promise<Map<string, TraceEntry[]>> {
    const results = new Map<string, TraceEntry[]>();

    let sessionIds = options.sessionIds;
    if (!sessionIds) {
      // Search all session trace files
      sessionIds = this.getAllTraceSessionIds();
    }

    for (const sessionId of sessionIds) {
      const traces = await this.getTraces(sessionId, options);
      if (traces.length > 0) {
        results.set(sessionId, traces);
      }
    }

    return results;
  }

  // ─── Export ──────────────────────────────────────────────────────────────

  async exportTraces(
    sessionId: string,
    options: TraceExportOptions
  ): Promise<string> {
    const entries = await this.getTraces(sessionId);
    const state = this.activeSessions.get(sessionId);

    if (options.format === "json") {
      return this.exportAsJSON(entries, options, state);
    } else {
      return this.exportAsMarkdown(entries, options, state);
    }
  }

  private exportAsJSON(
    entries: TraceEntry[],
    options: TraceExportOptions,
    state?: SessionTraceState
  ): string {
    const exportData = {
      version: TRACE_FILE_VERSION,
      sessionId: state?.sessionId || entries[0]?.sessionId || "unknown",
      exportedAt: new Date().toISOString(),
      entryCount: entries.length,
      entries: entries.map((entry) => {
        const exported: Record<string, unknown> = {
          id: entry.id,
          timestamp: entry.timestamp,
          type: entry.type,
          content:
            options.contentMaxLength && entry.content.length > options.contentMaxLength
              ? entry.content.substring(0, options.contentMaxLength) + "..."
              : entry.content,
        };

        if (options.includeMetadata !== false && entry.metadata) {
          exported.metadata = entry.metadata;
        }

        return exported;
      }),
    };

    return JSON.stringify(exportData, null, 2);
  }

  private exportAsMarkdown(
    entries: TraceEntry[],
    options: TraceExportOptions,
    state?: SessionTraceState
  ): string {
    const lines: string[] = [];

    lines.push("# Trace Export");
    lines.push("");
    lines.push(`**Session ID**: ${state?.sessionId || entries[0]?.sessionId || "unknown"}`);
    lines.push(`**Exported At**: ${new Date().toISOString()}`);
    lines.push(`**Total Entries**: ${entries.length}`);
    lines.push("");

    // Group entries by type
    const entriesByType = new Map<TraceEntryType, TraceEntry[]>();
    for (const entry of entries) {
      const existing = entriesByType.get(entry.type) || [];
      existing.push(entry);
      entriesByType.set(entry.type, existing);
    }

    // Summary table
    lines.push("## Summary");
    lines.push("");
    lines.push("| Type | Count |");
    lines.push("|------|-------|");
    for (const [type, typeEntries] of entriesByType) {
      lines.push(`| ${type} | ${typeEntries.length} |`);
    }
    lines.push("");

    // Detailed entries
    lines.push("## Trace Entries");
    lines.push("");

    for (const entry of entries) {
      const typeIcon = this.getTypeIcon(entry.type);
      const timestamp = new Date(entry.timestamp).toLocaleString();
      let content = entry.content;

      if (options.contentMaxLength && content.length > options.contentMaxLength) {
        content = content.substring(0, options.contentMaxLength) + "...";
      }

      lines.push(`### ${typeIcon} [${entry.type}] - ${timestamp}`);
      lines.push("");
      lines.push(content);
      lines.push("");

      if (options.includeMetadata !== false && entry.metadata) {
        lines.push("<details>");
        lines.push("<summary>Metadata</summary>");
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(entry.metadata, null, 2));
        lines.push("```");
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private getTypeIcon(type: TraceEntryType): string {
    switch (type) {
      case "thinking":
        return "🧠";
      case "action":
        return "⚡";
      case "tool_call":
        return "🔧";
      case "tool_result":
        return "📋";
      case "error":
        return "❌";
      case "info":
        return "ℹ️";
      default:
        return "•";
    }
  }

  // ─── File Rotation ───────────────────────────────────────────────────────

  async rotateOldFiles(): Promise<number> {
    if (!fs.existsSync(this.tracesDir)) return 0;

    const now = Date.now();
    const maxAgeMs = this.maxFileAgeDays * 24 * 60 * 60 * 1000;
    const maxSizeBytes = this.maxFileSizeMB * 1024 * 1024;

    const files = fs.readdirSync(this.tracesDir);
    let rotatedCount = 0;

    for (const file of files) {
      if (!file.endsWith(TRACE_FILE_EXTENSION)) continue;

      const filePath = path.join(this.tracesDir, file);
      const stat = fs.statSync(filePath);

      // Delete files older than max age
      if (now - stat.mtimeMs > maxAgeMs) {
        // Extract session ID to check if active
        const sessionId = this.extractSessionIdFromFileName(file);
        if (this.activeSessions.has(sessionId)) continue;

        fs.unlinkSync(filePath);
        rotatedCount++;
        console.info(`[TraceCollector] Rotated old trace file: ${file}`);
        continue;
      }

      // Rotate files that exceed max size
      if (stat.size > maxSizeBytes) {
        const sessionId = this.extractSessionIdFromFileName(file);
        if (this.activeSessions.has(sessionId)) continue;

        // Rename the old file with a timestamp suffix
        const timestamp = new Date(stat.mtimeMs).toISOString().replace(/[:.]/g, "-");
        const archivePath = path.join(
          this.tracesDir,
          `${sessionId}-${timestamp}${TRACE_FILE_EXTENSION}.archive`
        );

        fs.renameSync(filePath, archivePath);
        rotatedCount++;
        console.info(`[TraceCollector] Archived large trace file: ${file}`);
      }
    }

    return rotatedCount;
  }

  // ─── Buffer Management ───────────────────────────────────────────────────

  private async flushBuffer(sessionId: string): Promise<void> {
    const state = this.activeSessions.get(sessionId);
    if (!state || state.buffer.length === 0) return;

    if (!state.writeStream || state.writeStream.destroyed) {
      // Reopen the stream
      state.writeStream = fs.createWriteStream(state.filePath, {
        flags: "a",
        encoding: "utf-8",
      });
    }

    const entries = [...state.buffer];
    state.buffer = [];

    for (const entry of entries) {
      const line = JSON.stringify(entry) + "\n";
      const canWrite = state.writeStream.write(line);

      if (!canWrite) {
        // Wait for drain
        await new Promise<void>((resolve) => {
          state.writeStream!.once("drain", () => resolve());
        });
      }
    }

    state.lastFlushedAt = new Date().toISOString();
  }

  private async flushAllBuffers(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const sessionId of this.activeSessions.keys()) {
      promises.push(this.flushBuffer(sessionId));
    }

    await Promise.all(promises);
  }

  // ─── File I/O ────────────────────────────────────────────────────────────

  private getTraceFilePath(sessionId: string): string {
    // Use a safe filename based on session ID
    const safeName = sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.tracesDir, `${safeName}${TRACE_FILE_EXTENSION}`);
  }

  private extractSessionIdFromFileName(fileName: string): string {
    return fileName.replace(TRACE_FILE_EXTENSION, "").replace(/\.archive$/, "");
  }

  private async readTraceFile(filePath: string): Promise<TraceEntry[]> {
    const entries: TraceEntry[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);

          // Skip header line
          if (parsed.version && parsed.sessionId && !parsed.type) {
            continue;
          }

          // Validate it's a trace entry
          if (parsed.id && parsed.sessionId && parsed.type && parsed.timestamp) {
            entries.push(parsed as TraceEntry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (err) {
      console.error(`[TraceCollector] Error reading trace file:`, err);
    }

    return entries;
  }

  private async countExistingEntries(filePath: string): Promise<number> {
    const entries = await this.readTraceFile(filePath);
    return entries.length;
  }

  private async updateFileHeader(
    filePath: string,
    sessionId: string,
    entryCount: number
  ): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) return;

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      // Update or add header
      const header: TraceFileHeader = {
        version: TRACE_FILE_VERSION,
        sessionId,
        startedAt: lines[0] ? JSON.parse(lines[0]).startedAt || new Date().toISOString() : new Date().toISOString(),
        entryCount,
      };

      // Replace first line if it's a header, otherwise prepend
      if (lines[0] && lines[0].includes('"version"')) {
        lines[0] = JSON.stringify(header);
      } else {
        lines.unshift(JSON.stringify(header));
      }

      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    } catch (err) {
      console.error("[TraceCollector] Error updating file header:", err);
    }
  }

  private getAllTraceSessionIds(): string[] {
    if (!fs.existsSync(this.tracesDir)) return [];

    const files = fs.readdirSync(this.tracesDir);
    return files
      .filter((f) => f.endsWith(TRACE_FILE_EXTENSION))
      .map((f) => this.extractSessionIdFromFileName(f));
  }

  // ─── Filtering ───────────────────────────────────────────────────────────

  private filterEntries(
    entries: TraceEntry[],
    options?: TraceSearchOptions
  ): TraceEntry[] {
    if (!options) return entries;

    let filtered = entries;

    // Filter by type
    if (options.type) {
      filtered = filtered.filter((e) => e.type === options.type);
    }

    if (options.types && options.types.length > 0) {
      filtered = filtered.filter((e) => options.types!.includes(e.type));
    }

    // Filter by content
    if (options.contentContains) {
      const searchStr = options.contentContains.toLowerCase();
      filtered = filtered.filter((e) =>
        e.content.toLowerCase().includes(searchStr)
      );
    }

    // Filter by metadata
    if (options.metadataFilter) {
      for (const [key, value] of Object.entries(options.metadataFilter)) {
        filtered = filtered.filter(
          (e) => e.metadata && e.metadata[key] === value
        );
      }
    }

    // Filter by time range
    if (options.startTime) {
      const startMs = new Date(options.startTime).getTime();
      filtered = filtered.filter(
        (e) => new Date(e.timestamp).getTime() >= startMs
      );
    }

    if (options.endTime) {
      const endMs = new Date(options.endTime).getTime();
      filtered = filtered.filter(
        (e) => new Date(e.timestamp).getTime() <= endMs
      );
    }

    // Apply offset
    if (options.offset && options.offset > 0) {
      filtered = filtered.slice(options.offset);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    // Stop all active sessions
    const sessionIds = [...this.activeSessions.keys()];
    for (const sessionId of sessionIds) {
      await this.stopSession(sessionId);
    }

    // Stop timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    this.initialized = false;
    console.info("[TraceCollector] Shut down");
  }

  // ─── Utility Methods ─────────────────────────────────────────────────────

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  getActiveSessionIds(): string[] {
    return [...this.activeSessions.keys()];
  }

  getTotalTraceFileSize(): number {
    if (!fs.existsSync(this.tracesDir)) return 0;

    let totalSize = 0;
    const files = fs.readdirSync(this.tracesDir);
    for (const file of files) {
      if (file.endsWith(TRACE_FILE_EXTENSION) || file.endsWith(`${TRACE_FILE_EXTENSION}.archive`)) {
        const stat = fs.statSync(path.join(this.tracesDir, file));
        totalSize += stat.size;
      }
    }
    return totalSize;
  }
}
