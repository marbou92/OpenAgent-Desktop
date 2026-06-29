/**
 * OpenAgent-Desktop - Session Manager
 *
 * Manages chat sessions with full CRUD operations, persistence,
 * search, export/import, auto-save, and session templates.
 *
 * Sessions are stored as individual JSON files in the sessions directory.
 * Each session contains messages, provider info, extensions, recipes,
 * and metadata.
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  toolCalls?: SessionToolCall[];
  thinking?: string;
}

export interface SessionToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "completed" | "failed" | "denied" | "deactivated";
  /** Phase 0.6: content offset where this tool call was triggered, so the
   *  AskUserQuestion card renders at the correct position after reload. */
  _splitOffset?: number;
}

export interface Session {
  id: string;
  name: string;
  providerId: string;
  model: string;
  messages: SessionMessage[];
  extensions: string[];
  recipes: string[];
  createdAt: string;
  updatedAt: string;
  metadata: SessionMetadata;
  /** Phase 2.0.2: the project this session belongs to (null = global). */
  projectId?: string | null;
  /** Phase 2.0.2: the working directory for this session (from the project). */
  workingDirectory?: string;
}

export interface SessionMetadata {
  tags?: string[];
  summary?: string;
  totalTokens?: number;
  lastProviderId?: string;
  lastModel?: string;
  isTemplate?: boolean;
  templateName?: string;
  [key: string]: unknown;
}

export interface SessionSummary {
  id: string;
  name: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata: SessionMetadata;
  /** Phase 2.0.2: the project this session belongs to. */
  projectId?: string | null;
  /** Phase 2.0.2: the working directory for this session. */
  workingDirectory?: string;
}

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  providerId: string;
  model: string;
  systemPrompt?: string;
  extensions: string[];
  recipes: string[];
  metadata: SessionMetadata;
}

export interface SessionSearchResult {
  sessionId: string;
  sessionName: string;
  matchType: "name" | "content" | "metadata";
  matchContext: string;
  relevance: number;
}

export interface SessionManagerOptions {
  sessionsDir: string;
  maxConcurrentSessions?: number;
  autoSaveIntervalMs?: number;
  autoSaveDebounceMs?: number;
  traceCollector?: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_FILE_EXTENSION = ".session.json";
const TEMPLATE_FILE_EXTENSION = ".template.json";
const DEFAULT_AUTO_SAVE_INTERVAL_MS = 10000;
const DEFAULT_AUTO_SAVE_DEBOUNCE_MS = 2000;
const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;

// ─── SessionManager ───────────────────────────────────────────────────────────

export class SessionManager extends EventEmitter {
  private sessionsDir: string;
  private maxConcurrentSessions: number;
  private autoSaveIntervalMs: number;
  private autoSaveDebounceMs: number;
  private traceCollector?: any;

  private activeSessions: Map<string, Session> = new Map();
  private dirtySessions: Set<string> = new Set();
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private initialized = false;

  constructor(options: SessionManagerOptions) {
    super();

    this.sessionsDir = options.sessionsDir;
    this.maxConcurrentSessions =
      options.maxConcurrentSessions || DEFAULT_MAX_CONCURRENT_SESSIONS;
    this.autoSaveIntervalMs =
      options.autoSaveIntervalMs || DEFAULT_AUTO_SAVE_INTERVAL_MS;
    this.autoSaveDebounceMs =
      options.autoSaveDebounceMs || DEFAULT_AUTO_SAVE_DEBOUNCE_MS;
    this.traceCollector = options.traceCollector;
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    // Start auto-save timer
    this.autoSaveTimer = setInterval(() => {
      this.autoSaveDirtySessions();
    }, this.autoSaveIntervalMs);

    this.initialized = true;
    console.info("[SessionManager] Initialized");
  }

  // ─── CRUD Operations ─────────────────────────────────────────────────────

  /**
   * List all sessions (returns summaries, not full message content)
   */
  async list(): Promise<SessionSummary[]> {
    this.ensureInitialized();

    const summaries: SessionSummary[] = [];

    if (!fs.existsSync(this.sessionsDir)) return summaries;

    const files = fs.readdirSync(this.sessionsDir);
    for (const file of files) {
      if (!file.endsWith(SESSION_FILE_EXTENSION)) continue;
      if (file.endsWith(TEMPLATE_FILE_EXTENSION)) continue;

      const filePath = path.join(this.sessionsDir, file);
      try {
        const session = this.readSessionFile(filePath);
        if (session && !session.metadata?.isTemplate) {
          summaries.push(this.toSummary(session));
        }
      } catch (err) {
        console.error(`[SessionManager] Error reading session file ${file}:`, err);
      }
    }

    // Sort by updatedAt descending
    summaries.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return summaries;
  }

  /**
   * Create a new session
   */
  async create(options?: {
    name?: string;
    providerId?: string;
    model?: string;
    templateId?: string;
    extensions?: string[];
    metadata?: SessionMetadata;
    projectId?: string | null;
    workingDirectory?: string;
  }): Promise<Session> {
    this.ensureInitialized();

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check concurrent session limit
    if (this.activeSessions.size >= this.maxConcurrentSessions) {
      // Close the oldest active session
      const oldestSessionId = this.findOldestActiveSession();
      if (oldestSessionId) {
        await this.save(oldestSessionId, {});
        this.activeSessions.delete(oldestSessionId);
      }
    }

    let session: Session = {
      id: sessionId,
      name: options?.name || `Session ${new Date().toLocaleString()}`,
      providerId: options?.providerId || "",
      model: options?.model || "",
      messages: [],
      extensions: options?.extensions || [],
      recipes: [],
      createdAt: now,
      updatedAt: now,
      metadata: options?.metadata || {},
      // Phase 2.0.2: stamp the session with the active project's directory
      // so tools always run in the directory the session was created in.
      projectId: options?.projectId ?? null,
      workingDirectory: options?.workingDirectory,
    };

    // Apply template if specified
    if (options?.templateId) {
      const template = await this.loadTemplate(options.templateId);
      if (template) {
        session = this.applyTemplate(session, template);
      }
    }

    // Add system message if template has one
    if (session.messages.length === 0) {
      // No default system message - let the provider handle it
    }

    // Cache the session
    this.activeSessions.set(sessionId, session);

    // Persist to disk
    this.writeSessionFile(session);

    await this.traceCollector?.addEntry(sessionId, {
      type: "info",
      content: `Session created: ${session.name}`,
      metadata: { sessionId, providerId: session.providerId, model: session.model },
    });

    this.emit("session:created", session);

    return session;
  }

  /**
   * Load a session by ID
   */
  async load(sessionId: string): Promise<Session> {
    this.ensureInitialized();

    // Check if already in memory
    const cached = this.activeSessions.get(sessionId);
    if (cached) {
      return { ...cached };
    }

    // Load from disk
    const filePath = this.getSessionFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const session = this.readSessionFile(filePath);
    if (!session) {
      throw new Error(`Failed to read session: ${sessionId}`);
    }

    // Cache it
    this.activeSessions.set(sessionId, session);

    await this.traceCollector?.addEntry(sessionId, {
      type: "info",
      content: `Session loaded: ${session.name}`,
      metadata: { sessionId },
    });

    return { ...session };
  }

  /**
   * Save a session (partial update supported)
   */
  async save(sessionId: string, data: Partial<Session>): Promise<void> {
    this.ensureInitialized();

    let session = this.activeSessions.get(sessionId);

    if (!session) {
      // Try to load it first
      try {
        session = await this.load(sessionId);
      } catch {
        throw new Error(`Session not found: ${sessionId}`);
      }
    }

    // Apply partial updates
    if (data.name !== undefined) session.name = data.name;
    if (data.providerId !== undefined) session.providerId = data.providerId;
    if (data.model !== undefined) session.model = data.model;
    if (data.messages !== undefined) session.messages = data.messages;
    if (data.extensions !== undefined) session.extensions = data.extensions;
    if (data.recipes !== undefined) session.recipes = data.recipes;
    if (data.metadata !== undefined) {
      session.metadata = { ...session.metadata, ...data.metadata };
    }

    session.updatedAt = new Date().toISOString();

    // Update cache
    this.activeSessions.set(sessionId, session);

    // Mark as dirty for auto-save
    this.dirtySessions.add(sessionId);

    // Debounced save
    this.debouncedSave(sessionId);
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<void> {
    this.ensureInitialized();

    // Remove from cache
    this.activeSessions.delete(sessionId);
    this.dirtySessions.delete(sessionId);

    // Cancel any pending debounce timers
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }

    // Delete from disk
    const filePath = this.getSessionFilePath(sessionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.traceCollector?.addEntry(sessionId, {
      type: "info",
      content: "Session deleted",
      metadata: { sessionId },
    });

    this.emit("session:deleted", sessionId);
  }

  // ─── Message Operations ──────────────────────────────────────────────────

  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: string,
    message: Omit<SessionMessage, "id" | "timestamp">
  ): Promise<SessionMessage> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const fullMessage: SessionMessage = {
      id: crypto.randomUUID(),
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
      metadata: message.metadata,
      toolCalls: message.toolCalls,
    };

    session.messages.push(fullMessage);
    session.updatedAt = new Date().toISOString();

    // Mark as dirty
    this.dirtySessions.add(sessionId);
    this.debouncedSave(sessionId);

    return fullMessage;
  }

  /**
   * Update a specific message in a session
   */
  async updateMessage(
    sessionId: string,
    messageId: string,
    updates: Partial<SessionMessage>
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const messageIndex = session.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error(`Message not found: ${messageId}`);
    }

    session.messages[messageIndex] = {
      ...session.messages[messageIndex],
      ...updates,
    };
    session.updatedAt = new Date().toISOString();

    this.dirtySessions.add(sessionId);
    this.debouncedSave(sessionId);
  }

  /**
   * Delete a specific message from a session
   */
  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.messages = session.messages.filter((m) => m.id !== messageId);
    session.updatedAt = new Date().toISOString();

    this.dirtySessions.add(sessionId);
    this.debouncedSave(sessionId);
  }

  // ─── Export / Import ─────────────────────────────────────────────────────

  /**
   * Export a session as JSON or Markdown
   */
  async exportSession(
    sessionId: string,
    format: "json" | "markdown"
  ): Promise<string> {
    const session = this.activeSessions.get(sessionId) || (await this.load(sessionId));

    if (format === "json") {
      return this.exportAsJSON(session);
    } else {
      return this.exportAsMarkdown(session);
    }
  }

  /**
   * Import a session from JSON string
   */
  async importSession(jsonString: string): Promise<Session> {
    let data: Partial<Session>;

    try {
      data = JSON.parse(jsonString);
    } catch {
      throw new Error("Invalid JSON format for session import");
    }

    // Validate required fields
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error("Session import requires a 'messages' array");
    }

    // Create a new session with imported data
    const session = await this.create({
      name: data.name || `Imported Session`,
      providerId: data.providerId || "openai",
      model: data.model || "gpt-4o",
      extensions: data.extensions || [],
      metadata: {
        ...data.metadata,
        importedAt: new Date().toISOString(),
        originalId: data.id,
      },
    });

    // Add imported messages
    for (const msg of data.messages) {
      const message: SessionMessage = {
        id: msg.id || crypto.randomUUID(),
        role: msg.role || "user",
        content: msg.content || "",
        timestamp: msg.timestamp || new Date().toISOString(),
        metadata: msg.metadata,
        toolCalls: msg.toolCalls,
      };
      session.messages.push(message);
    }

    session.updatedAt = new Date().toISOString();
    this.activeSessions.set(session.id, session);
    this.writeSessionFile(session);

    return session;
  }

  private exportAsJSON(session: Session): string {
    return JSON.stringify(session, null, 2);
  }

  private exportAsMarkdown(session: Session): string {
    const lines: string[] = [];

    lines.push(`# ${session.name}`);
    lines.push("");
    lines.push(`**Session ID**: ${session.id}`);
    lines.push(`**Provider**: ${session.providerId}`);
    lines.push(`**Model**: ${session.model}`);
    lines.push(`**Created**: ${new Date(session.createdAt).toLocaleString()}`);
    lines.push(`**Updated**: ${new Date(session.updatedAt).toLocaleString()}`);
    lines.push(`**Messages**: ${session.messages.length}`);
    lines.push("");

    if (session.extensions.length > 0) {
      lines.push(`**Extensions**: ${session.extensions.join(", ")}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");

    for (const message of session.messages) {
      const roleLabel = this.getRoleLabel(message.role);
      const timestamp = new Date(message.timestamp).toLocaleString();

      lines.push(`## ${roleLabel} — ${timestamp}`);
      lines.push("");
      lines.push(message.content);
      lines.push("");

      if (message.toolCalls && message.toolCalls.length > 0) {
        lines.push("### Tool Calls");
        lines.push("");
        for (const tc of message.toolCalls) {
          lines.push(`- **${tc.name}** (${tc.status})`);
          lines.push(`  - Arguments: \`${JSON.stringify(tc.arguments)}\``);
          if (tc.result !== undefined) {
            lines.push(`  - Result: \`${JSON.stringify(tc.result)}\``);
          }
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  private getRoleLabel(role: string): string {
    switch (role) {
      case "user":
        return "👤 User";
      case "assistant":
        return "🤖 Assistant";
      case "system":
        return "⚙️ System";
      case "tool":
        return "🔧 Tool";
      default:
        return role;
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────────

  /**
   * Search across all sessions
   */
  async search(query: string): Promise<SessionSearchResult[]> {
    this.ensureInitialized();

    const results: SessionSearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    const summaries = await this.list();
    for (const summary of summaries) {
      // Search in name
      if (summary.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          sessionId: summary.id,
          sessionName: summary.name,
          matchType: "name",
          matchContext: summary.name,
          relevance: 1.0,
        });
        continue;
      }

      // Search in metadata tags
      if (summary.metadata?.tags) {
        const tagMatch = summary.metadata.tags.find((tag: string) =>
          tag.toLowerCase().includes(lowerQuery)
        );
        if (tagMatch) {
          results.push({
            sessionId: summary.id,
            sessionName: summary.name,
            matchType: "metadata",
            matchContext: `Tag: ${tagMatch}`,
            relevance: 0.8,
          });
          continue;
        }
      }

      // Search in message content (requires loading full session)
      try {
        const session = await this.load(summary.id);
        for (const message of session.messages) {
          if (message.content.toLowerCase().includes(lowerQuery)) {
            const contextStart = Math.max(
              0,
              message.content.toLowerCase().indexOf(lowerQuery) - 50
            );
            const contextEnd = Math.min(
              message.content.length,
              message.content.toLowerCase().indexOf(lowerQuery) + query.length + 50
            );
            const matchContext =
              (contextStart > 0 ? "..." : "") +
              message.content.substring(contextStart, contextEnd) +
              (contextEnd < message.content.length ? "..." : "");

            results.push({
              sessionId: summary.id,
              sessionName: summary.name,
              matchType: "content",
              matchContext,
              relevance: 0.6,
            });
            break; // Only one result per session for content match
          }
        }
      } catch {
        // Skip sessions that fail to load
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  // ─── Templates ───────────────────────────────────────────────────────────

  /**
   * List all session templates
   */
  async listTemplates(): Promise<SessionTemplate[]> {
    this.ensureInitialized();

    const templates: SessionTemplate[] = [];

    if (!fs.existsSync(this.sessionsDir)) return templates;

    const files = fs.readdirSync(this.sessionsDir);
    for (const file of files) {
      if (!file.endsWith(TEMPLATE_FILE_EXTENSION)) continue;

      const filePath = path.join(this.sessionsDir, file);
      try {
        const template = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        templates.push(template);
      } catch (err) {
        console.error(`[SessionManager] Error reading template file ${file}:`, err);
      }
    }

    return templates;
  }

  /**
   * Create a template from an existing session
   */
  async createTemplate(
    sessionId: string,
    templateName: string,
    description?: string
  ): Promise<SessionTemplate> {
    const session = this.activeSessions.get(sessionId) || (await this.load(sessionId));

    const template: SessionTemplate = {
      id: crypto.randomUUID(),
      name: templateName,
      description: description || `Template from: ${session.name}`,
      providerId: session.providerId,
      model: session.model,
      systemPrompt: session.messages.find((m) => m.role === "system")?.content,
      extensions: [...session.extensions],
      recipes: [...session.recipes],
      metadata: {
        ...session.metadata,
        isTemplate: true,
        templateName,
        sourceSessionId: sessionId,
      },
    };

    // Save template
    const templatePath = this.getTemplateFilePath(template.id);
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), "utf-8");

    return template;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const templatePath = this.getTemplateFilePath(templateId);
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
  }

  /**
   * Load a template by ID
   */
  private async loadTemplate(templateId: string): Promise<SessionTemplate | null> {
    const templatePath = this.getTemplateFilePath(templateId);
    if (!fs.existsSync(templatePath)) return null;

    try {
      return JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    } catch {
      return null;
    }
  }

  /**
   * Apply a template to a session
   */
  private applyTemplate(session: Session, template: SessionTemplate): Session {
    session.providerId = template.providerId;
    session.model = template.model;
    session.extensions = [...template.extensions];
    session.recipes = [...template.recipes];
    session.metadata = {
      ...session.metadata,
      templateId: template.id,
      templateName: template.name,
    };

    // Add system prompt from template
    if (template.systemPrompt) {
      session.messages.unshift({
        id: crypto.randomUUID(),
        role: "system",
        content: template.systemPrompt,
        timestamp: new Date().toISOString(),
      });
    }

    return session;
  }

  // ─── Auto-Save ───────────────────────────────────────────────────────────

  private debouncedSave(sessionId: string): void {
    // Cancel existing timer for this session
    const existingTimer = this.debounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set a new debounce timer
    const timer = setTimeout(() => {
      this.immediateSave(sessionId);
      this.debounceTimers.delete(sessionId);
    }, this.autoSaveDebounceMs);

    this.debounceTimers.set(sessionId, timer);
  }

  private async immediateSave(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      this.writeSessionFile(session);
      this.dirtySessions.delete(sessionId);
    } catch (err) {
      console.error(`[SessionManager] Error auto-saving session ${sessionId}:`, err);
    }
  }

  private async autoSaveDirtySessions(): Promise<void> {
    for (const sessionId of this.dirtySessions) {
      await this.immediateSave(sessionId);
    }
  }

  // ─── File I/O ────────────────────────────────────────────────────────────

  private getSessionFilePath(sessionId: string): string {
    const safeName = sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.sessionsDir, `${safeName}${SESSION_FILE_EXTENSION}`);
  }

  private getTemplateFilePath(templateId: string): string {
    const safeName = templateId.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.sessionsDir, `${safeName}${TEMPLATE_FILE_EXTENSION}`);
  }

  private readSessionFile(filePath: string): Session | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as Session;
    } catch (err) {
      console.error(`[SessionManager] Error reading session file:`, err);
      return null;
    }
  }

  private writeSessionFile(session: Session): void {
    const filePath = this.getSessionFilePath(session.id);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically using a temp file
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(session, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private toSummary(session: Session): SessionSummary {
    return {
      id: session.id,
      name: session.name,
      providerId: session.providerId,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      metadata: session.metadata,
      // Phase 2.0.2: include project scope in the summary
      projectId: session.projectId ?? null,
      workingDirectory: session.workingDirectory,
    };
  }

  private findOldestActiveSession(): string | null {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.activeSessions) {
      const updatedTime = new Date(session.updatedAt).getTime();
      if (updatedTime < oldestTime) {
        oldestTime = updatedTime;
        oldestId = id;
      }
    }

    return oldestId;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SessionManager is not initialized. Call initialize() first.");
    }
  }

  // ─── Shutdown ────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    // Save all dirty sessions
    await this.autoSaveDirtySessions();

    // Clear all timers
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Clear caches
    this.activeSessions.clear();
    this.dirtySessions.clear();

    this.initialized = false;
    console.info("[SessionManager] Shut down");
  }

  // ─── Statistics ──────────────────────────────────────────────────────────

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  getDirtySessionCount(): number {
    return this.dirtySessions.size;
  }

  getTotalSessionCount(): number {
    if (!fs.existsSync(this.sessionsDir)) return 0;
    return fs
      .readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith(SESSION_FILE_EXTENSION) && !f.endsWith(TEMPLATE_FILE_EXTENSION))
      .length;
  }
}
