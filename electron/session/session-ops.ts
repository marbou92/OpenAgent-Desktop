/**
 * OpenAgent-Desktop - Enhanced Session Operations
 *
 * Advanced session management: forking, reverting, sharing,
 * branching, and comparison. Like OpenCode's session management.
 *
 * Features:
 *   - Fork sessions at specific messages with full session creation
 *   - Revert with undo (unrevert) support
 *   - Share sessions with URL generation and expiration
 *   - Named branches for parallel exploration
 *   - Session comparison with diff highlighting
 *   - Merge sessions
 *   - Full session history tracking
 *   - Export as Markdown
 *   - Session tagging and search
 *   - Persistence for all operations
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface SessionBranch {
  id: string;
  parentId: string;
  name: string;
  forkedAtMessageIndex: number;
  createdAt: string;
}

export interface SessionComparison {
  sessionId1: string;
  sessionId2: string;
  differences: SessionDiff[];
  summary: {
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
  };
}

export interface SessionDiff {
  type: 'added' | 'removed' | 'modified';
  messageIndex: number;
  content: string;
  side: 'left' | 'right' | 'both';
}

export interface SessionHistoryEntry {
  id: string;
  sessionId: string;
  operation: 'fork' | 'revert' | 'unrevert' | 'share' | 'branch' | 'merge' | 'tag' | 'export';
  timestamp: string;
  details: Record<string, unknown>;
}

export interface SessionForkResult {
  forkId: string;
  forkedSessionId: string;
  forkedMessages: SessionOpsMessage[];
}

export interface SessionRevertResult {
  revertId: string;
  remainingMessages: SessionOpsMessage[];
}

export interface SessionShareResult {
  shareUrl: string;
  shareToken: string;
  expiresAt?: string;
}

export interface SessionTag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface SessionOpsMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ForkTreeNode {
  sessionId: string;
  name: string;
  forkedAtIndex?: number;
  children: ForkTreeNode[];
}

// ─── Persistence Types ─────────────────────────────────────────────────────────

interface PersistedBranches {
  [sessionId: string]: SessionBranch[];
}

interface PersistedReverts {
  [revertId: string]: {
    sessionId: string;
    revertedAtMessageIndex: number;
    revertedMessages: SessionOpsMessage[];
    unreverted: boolean;
    createdAt: string;
  };
}

interface PersistedShares {
  [shareId: string]: {
    sessionId: string;
    shareToken: string;
    expiresAt?: string;
    createdAt: string;
  };
}

interface _PersistedHistory {
  entries: SessionHistoryEntry[];
}

interface _PersistedTags {
  [sessionId: string]: SessionTag[];
}

// ─── Session Operations ────────────────────────────────────────────────────────

export class SessionOperations extends EventEmitter {
  private branches: Map<string, SessionBranch[]> = new Map();
  private reverts: Map<string, {
    sessionId: string;
    revertedAtMessageIndex: number;
    revertedMessages: SessionOpsMessage[];
    unreverted: boolean;
    createdAt: string;
  }> = new Map();
  private shares: Map<string, {
    sessionId: string;
    shareToken: string;
    expiresAt?: string;
    createdAt: string;
  }> = new Map();
  private history: Map<string, SessionHistoryEntry[]> = new Map();
  private tags: Map<string, SessionTag[]> = new Map();
  private configDir: string;
  private sessionsDir: string;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.openagent');
    this.sessionsDir = path.join(this.configDir, 'sessions');
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await fs.mkdir(this.sessionsDir, { recursive: true });
      await fs.mkdir(path.join(this.configDir, 'session-ops'), { recursive: true });
    } catch {
      // Directory creation failed, will try on-demand
    }
  }

  // ─── Fork ──────────────────────────────────────────────────────────────────

  /**
   * Fork a session at a specific message index.
   * Creates a new session with messages up to that point.
   */
  async fork(
    sessionId: string,
    atMessageIndex: number,
    title?: string,
  ): Promise<SessionForkResult> {
    const forkId = `fork-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const forkedSessionId = `session-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    // Load source session messages
    const messages = await this.loadSessionMessages(sessionId);
    const forkedMessages = messages.slice(0, atMessageIndex + 1);

    // Save the forked session
    await this.saveForkedSession(forkedSessionId, {
      id: forkedSessionId,
      name: title || `Fork of ${sessionId}`,
      messages: forkedMessages,
      sourceSessionId: sessionId,
      forkedAtIndex: atMessageIndex,
      createdAt: new Date().toISOString(),
    });

    // Track history
    this.addHistory(sessionId, 'fork', {
      forkId,
      forkedSessionId,
      atMessageIndex,
      title,
    });

    this.emit('session:forked', {
      forkId,
      forkedSessionId,
      parentSessionId: sessionId,
      atMessageIndex,
    });

    return { forkId, forkedSessionId, forkedMessages };
  }

  // ─── Revert ────────────────────────────────────────────────────────────────

  /**
   * Revert a session to a specific message index.
   * Stores reverted messages for potential unrevert.
   */
  async revert(
    sessionId: string,
    atMessageIndex: number,
  ): Promise<SessionRevertResult> {
    const revertId = `revert-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const messages = await this.loadSessionMessages(sessionId);
    const remainingMessages = messages.slice(0, atMessageIndex + 1);
    const revertedMessages = messages.slice(atMessageIndex + 1);

    // Store revert for undo
    this.reverts.set(revertId, {
      sessionId,
      revertedAtMessageIndex: atMessageIndex,
      revertedMessages,
      unreverted: false,
      createdAt: new Date().toISOString(),
    });

    // Persist revert
    await this.persistRevert(revertId, sessionId, atMessageIndex, revertedMessages);

    // Update session with remaining messages
    await this.updateSessionMessages(sessionId, remainingMessages);

    // Track history
    this.addHistory(sessionId, 'revert', {
      revertId,
      atMessageIndex,
      removedCount: revertedMessages.length,
    });

    this.emit('session:reverted', {
      revertId,
      sessionId,
      atMessageIndex,
      removedCount: revertedMessages.length,
    });

    return { revertId, remainingMessages };
  }

  /**
   * Undo a revert, restoring the reverted messages.
   */
  async unrevert(sessionId: string, revertId: string): Promise<void> {
    const revertData = this.reverts.get(revertId);
    if (!revertData) {
      throw new Error(`Revert ${revertId} not found`);
    }

    if (revertData.sessionId !== sessionId) {
      throw new Error('Revert does not belong to this session');
    }

    if (revertData.unreverted) {
      throw new Error('Revert has already been undone');
    }

    // Restore reverted messages
    const currentMessages = await this.loadSessionMessages(sessionId);
    const restoredMessages = [
      ...currentMessages,
      ...revertData.revertedMessages,
    ];

    await this.updateSessionMessages(sessionId, restoredMessages);

    // Mark as unreverted
    revertData.unreverted = true;
    await this.persistRevert(
      revertId,
      sessionId,
      revertData.revertedAtMessageIndex,
      revertData.revertedMessages,
    );

    // Track history
    this.addHistory(sessionId, 'unrevert', {
      revertId,
      restoredCount: revertData.revertedMessages.length,
    });

    this.emit('session:unreverted', {
      revertId,
      sessionId,
      restoredCount: revertData.revertedMessages.length,
    });
  }

  // ─── Share ─────────────────────────────────────────────────────────────────

  /**
   * Share a session with a URL and optional expiration.
   */
  async share(
    sessionId: string,
    expiresInDays?: number,
  ): Promise<SessionShareResult> {
    const shareId = `share-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const shareToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const shareData = {
      sessionId,
      shareToken,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    this.shares.set(shareId, shareData);
    await this.persistShare(shareId, shareData);

    const shareUrl = `https://openagent.sh/share/${shareToken}`;

    // Track history
    this.addHistory(sessionId, 'share', {
      shareId,
      shareToken,
      expiresAt,
    });

    this.emit('session:shared', {
      shareId,
      sessionId,
      shareUrl,
      expiresAt,
    });

    return { shareUrl, shareToken, expiresAt };
  }

  // ─── Branch ────────────────────────────────────────────────────────────────

  /**
   * Create a named branch from a session at a specific message index.
   */
  async branch(
    sessionId: string,
    atMessageIndex: number,
    name: string,
  ): Promise<SessionBranch> {
    const branch: SessionBranch = {
      id: `branch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      parentId: sessionId,
      name,
      forkedAtMessageIndex: atMessageIndex,
      createdAt: new Date().toISOString(),
    };

    // Add to branches list
    const existingBranches = this.branches.get(sessionId) || [];
    existingBranches.push(branch);
    this.branches.set(sessionId, existingBranches);

    // Create the forked session for the branch
    const messages = await this.loadSessionMessages(sessionId);
    const branchMessages = messages.slice(0, atMessageIndex + 1);

    await this.saveForkedSession(branch.id, {
      id: branch.id,
      name,
      messages: branchMessages,
      sourceSessionId: sessionId,
      forkedAtIndex: atMessageIndex,
      createdAt: branch.createdAt,
    });

    // Persist
    await this.persistBranches(sessionId, existingBranches);

    // Track history
    this.addHistory(sessionId, 'branch', {
      branchId: branch.id,
      name,
      atMessageIndex,
    });

    this.emit('session:branched', branch);

    return branch;
  }

  /**
   * Get all branches for a session.
   */
  getBranches(sessionId: string): SessionBranch[] {
    return this.branches.get(sessionId) || [];
  }

  /**
   * Build a fork tree visualization from a session.
   */
  getForkTree(sessionId: string): ForkTreeNode {
    const root: ForkTreeNode = {
      sessionId,
      name: 'Root',
      children: [],
    };

    const branches = this.branches.get(sessionId) || [];
    for (const branch of branches) {
      root.children.push({
        sessionId: branch.id,
        name: branch.name,
        forkedAtIndex: branch.forkedAtMessageIndex,
        children: this.buildSubTree(branch.id),
      });
    }

    return root;
  }

  private buildSubTree(sessionId: string): ForkTreeNode[] {
    const branches = this.branches.get(sessionId) || [];
    return branches.map((branch) => ({
      sessionId: branch.id,
      name: branch.name,
      forkedAtIndex: branch.forkedAtMessageIndex,
      children: this.buildSubTree(branch.id),
    }));
  }

  // ─── Compare ───────────────────────────────────────────────────────────────

  /**
   * Compare two sessions and find differences.
   */
  async compare(sessionId1: string, sessionId2: string): Promise<SessionComparison> {
    const messages1 = await this.loadSessionMessages(sessionId1);
    const messages2 = await this.loadSessionMessages(sessionId2);

    const differences: SessionDiff[] = [];
    const maxLen = Math.max(messages1.length, messages2.length);

    for (let i = 0; i < maxLen; i++) {
      const msg1 = messages1[i];
      const msg2 = messages2[i];

      if (!msg1 && msg2) {
        differences.push({
          type: 'added',
          messageIndex: i,
          content: msg2.content,
          side: 'right',
        });
      } else if (msg1 && !msg2) {
        differences.push({
          type: 'removed',
          messageIndex: i,
          content: msg1.content,
          side: 'left',
        });
      } else if (msg1 && msg2 && msg1.content !== msg2.content) {
        differences.push({
          type: 'modified',
          messageIndex: i,
          content: `${msg1.content} → ${msg2.content}`,
          side: 'both',
        });
      }
    }

    return {
      sessionId1,
      sessionId2,
      differences,
      summary: {
        addedCount: differences.filter((d) => d.type === 'added').length,
        removedCount: differences.filter((d) => d.type === 'removed').length,
        modifiedCount: differences.filter((d) => d.type === 'modified').length,
      },
    };
  }

  // ─── Merge ─────────────────────────────────────────────────────────────────

  /**
   * Merge a source session into a target session.
   * Appends messages from source that aren't in target.
   */
  async merge(sourceSessionId: string, targetSessionId: string): Promise<void> {
    const sourceMessages = await this.loadSessionMessages(sourceSessionId);
    const targetMessages = await this.loadSessionMessages(targetSessionId);

    // Find unique messages from source (by content + role combination)
    const targetContentSet = new Set(
      targetMessages.map((m) => `${m.role}:${m.content}`),
    );

    const newMessages = sourceMessages.filter(
      (m) => !targetContentSet.has(`${m.role}:${m.content}`),
    );

    const mergedMessages = [...targetMessages, ...newMessages];
    await this.updateSessionMessages(targetSessionId, mergedMessages);

    // Track history
    this.addHistory(targetSessionId, 'merge', {
      sourceSessionId,
      addedCount: newMessages.length,
    });

    this.emit('session:merged', {
      sourceSessionId,
      targetSessionId,
      addedCount: newMessages.length,
    });
  }

  // ─── History ───────────────────────────────────────────────────────────────

  /**
   * Get full session history.
   */
  getHistory(sessionId: string): SessionHistoryEntry[] {
    return this.history.get(sessionId) || [];
  }

  private addHistory(
    sessionId: string,
    operation: SessionHistoryEntry['operation'],
    details: Record<string, unknown>,
  ): void {
    const entries = this.history.get(sessionId) || [];
    entries.push({
      id: `hist-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      sessionId,
      operation,
      timestamp: new Date().toISOString(),
      details,
    });
    this.history.set(sessionId, entries);
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  /**
   * Export a session as Markdown.
   */
  async exportMarkdown(sessionId: string): Promise<string> {
    const messages = await this.loadSessionMessages(sessionId);
    const lines: string[] = [];

    lines.push(`# Session Export`);
    lines.push(`Session ID: ${sessionId}`);
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of messages) {
      const roleLabel =
        msg.role === 'user'
          ? '👤 User'
          : msg.role === 'assistant'
            ? '🤖 Assistant'
            : msg.role === 'system'
              ? '⚙️ System'
              : '🔧 Tool';

      lines.push(`### ${roleLabel}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export a session as PDF (simplified - returns a buffer with markdown content).
   * In production, this would use a PDF library.
   */
  async exportPDF(sessionId: string): Promise<Buffer> {
    const markdown = await this.exportMarkdown(sessionId);

    // Simplified: wrap markdown in a basic document structure
    // In production, would use puppeteer or pdfkit
    const pdfContent = Buffer.from(markdown, 'utf-8');

    // Track history
    this.addHistory(sessionId, 'export', { format: 'pdf' });

    return pdfContent;
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  /**
   * Add a tag to a session.
   */
  addTag(sessionId: string, name: string, color?: string): SessionTag {
    const tag: SessionTag = {
      id: `tag-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name,
      color,
      createdAt: new Date().toISOString(),
    };

    const tags = this.tags.get(sessionId) || [];
    // Prevent duplicate tag names
    if (tags.some((t) => t.name === name)) {
      return tags.find((t) => t.name === name)!;
    }
    tags.push(tag);
    this.tags.set(sessionId, tags);

    this.emit('session:tagged', { sessionId, tag });

    return tag;
  }

  /**
   * Remove a tag from a session.
   */
  removeTag(sessionId: string, tagId: string): void {
    const tags = this.tags.get(sessionId) || [];
    const filtered = tags.filter((t) => t.id !== tagId);
    this.tags.set(sessionId, filtered);

    this.emit('session:untagged', { sessionId, tagId });
  }

  /**
   * Get tags for a session.
   */
  getTags(sessionId: string): SessionTag[] {
    return this.tags.get(sessionId) || [];
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  /**
   * Search across all sessions for a query.
   * Returns session IDs and matching message indices.
   */
  async searchAcrossSessions(
    query: string,
  ): Promise<Array<{ sessionId: string; matchCount: number; matchedIndices: number[] }>> {
    const results: Array<{
      sessionId: string;
      matchCount: number;
      matchedIndices: number[];
    }> = [];

    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of sessionFiles) {
        try {
          const content = await fs.readFile(path.join(this.sessionsDir, file), 'utf-8');
          const session = JSON.parse(content);
          const sessionId = session.id || file.replace('.json', '');

          const matchedIndices: number[] = [];
          const lowerQuery = query.toLowerCase();

          if (session.messages && Array.isArray(session.messages)) {
            session.messages.forEach(
              (msg: SessionOpsMessage, index: number) => {
                if (msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
                  matchedIndices.push(index);
                }
              },
            );
          }

          if (matchedIndices.length > 0) {
            results.push({
              sessionId,
              matchCount: matchedIndices.length,
              matchedIndices,
            });
          }
        } catch {
          // Skip invalid session files
        }
      }
    } catch {
      // Sessions directory doesn't exist
    }

    return results;
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  private async loadSessionMessages(sessionId: string): Promise<SessionOpsMessage[]> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content);
      return session.messages || [];
    } catch {
      return [];
    }
  }

  private async updateSessionMessages(
    sessionId: string,
    messages: SessionOpsMessage[],
  ): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);

    let session: Record<string, unknown>;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      session = JSON.parse(content);
    } catch {
      session = { id: sessionId, name: sessionId, createdAt: new Date().toISOString() };
    }

    session.messages = messages;
    session.updatedAt = new Date().toISOString();

    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  private async saveForkedSession(
    sessionId: string,
    data: {
      id: string;
      name: string;
      messages: SessionOpsMessage[];
      sourceSessionId: string;
      forkedAtIndex: number;
      createdAt: string;
    },
  ): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    const session = {
      ...data,
      updatedAt: new Date().toISOString(),
      metadata: {
        forkedFrom: data.sourceSessionId,
        forkedAtIndex: data.forkedAtIndex,
      },
    };
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  private async persistRevert(
    revertId: string,
    sessionId: string,
    atIndex: number,
    revertedMessages: SessionOpsMessage[],
  ): Promise<void> {
    const opsDir = path.join(this.configDir, 'session-ops');
    await fs.mkdir(opsDir, { recursive: true });

    const filePath = path.join(opsDir, 'reverts.json');
    let reverts: PersistedReverts = {};

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      reverts = JSON.parse(content);
    } catch {
      // First time
    }

    reverts[revertId] = {
      sessionId,
      revertedAtMessageIndex: atIndex,
      revertedMessages,
      unreverted: this.reverts.get(revertId)?.unreverted || false,
      createdAt: new Date().toISOString(),
    };

    await fs.writeFile(filePath, JSON.stringify(reverts, null, 2), 'utf-8');
  }

  private async persistShare(
    shareId: string,
    data: { sessionId: string; shareToken: string; expiresAt?: string; createdAt: string },
  ): Promise<void> {
    const opsDir = path.join(this.configDir, 'session-ops');
    await fs.mkdir(opsDir, { recursive: true });

    const filePath = path.join(opsDir, 'shares.json');
    let shares: PersistedShares = {};

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      shares = JSON.parse(content);
    } catch {
      // First time
    }

    shares[shareId] = data;
    await fs.writeFile(filePath, JSON.stringify(shares, null, 2), 'utf-8');
  }

  private async persistBranches(
    sessionId: string,
    branches: SessionBranch[],
  ): Promise<void> {
    const opsDir = path.join(this.configDir, 'session-ops');
    await fs.mkdir(opsDir, { recursive: true });

    const filePath = path.join(opsDir, 'branches.json');
    let allBranches: PersistedBranches = {};

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      allBranches = JSON.parse(content);
    } catch {
      // First time
    }

    allBranches[sessionId] = branches;
    await fs.writeFile(filePath, JSON.stringify(allBranches, null, 2), 'utf-8');
  }

  /**
   * Load all persisted data on startup.
   */
  async loadPersistedData(): Promise<void> {
    const opsDir = path.join(this.configDir, 'session-ops');

    // Load reverts
    try {
      const content = await fs.readFile(path.join(opsDir, 'reverts.json'), 'utf-8');
      const data: PersistedReverts = JSON.parse(content);
      for (const [id, revert] of Object.entries(data)) {
        this.reverts.set(id, revert);
      }
    } catch {
      // No persisted reverts
    }

    // Load shares
    try {
      const content = await fs.readFile(path.join(opsDir, 'shares.json'), 'utf-8');
      const data: PersistedShares = JSON.parse(content);
      for (const [id, share] of Object.entries(data)) {
        this.shares.set(id, share);
      }
    } catch {
      // No persisted shares
    }

    // Load branches
    try {
      const content = await fs.readFile(path.join(opsDir, 'branches.json'), 'utf-8');
      const data: PersistedBranches = JSON.parse(content);
      for (const [sessionId, branches] of Object.entries(data)) {
        this.branches.set(sessionId, branches);
      }
    } catch {
      // No persisted branches
    }
  }
}
