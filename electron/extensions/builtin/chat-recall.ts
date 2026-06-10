/**
 * OpenAgent Desktop - Chat Recall Extension
 *
 * Search and recall across all session history:
 * - search_conversations: Search across all session history
 * - get_recent_topics: Get recent conversation topics
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolDefinition,
  ToolResult,
  Permission,
  PermissionLevel,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Chat history types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sessionId: string;
  toolCalls?: Array<{ tool: string; extension: string }>;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  tags: string[];
  summary: string;
}

interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  matchedMessages: Array<{
    role: string;
    content: string;
    timestamp: string;
    relevanceScore: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Recall Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class ChatRecallExtension extends BaseExtension {
  private historyPath: string;
  private sessions: Map<string, ChatSession> = new Map();
  private messages: ChatMessage[] = [];
  private searchIndex: Map<string, Set<number>> = new Map(); // token -> message indices
  private loaded: boolean = false;

  constructor(config: ExtensionConfig) {
    super(config);
    this.historyPath = this.getSetting<string>(
      'historyPath',
      path.join(os.homedir(), '.openagent', 'chat-history'),
    );
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'search_conversations',
        description:
          'Search across all chat session history for relevant conversations. ' +
          'Returns matching messages with their session context and relevance scores.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query — matches against message content and session titles',
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of results to return (default: 10)',
              minimum: 1,
              maximum: 50,
              default: 10,
            },
          },
          required: ['query'],
        },
      },
      this.executeSearchConversations.bind(this),
    );

    this.registerTool(
      {
        name: 'get_recent_topics',
        description:
          'Get a summary of recent conversation topics. Useful for understanding ' +
          'what has been discussed recently without reading full history.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Maximum number of topics to return (default: 10)',
              minimum: 1,
              maximum: 50,
              default: 10,
            },
          },
        },
      },
      this.executeGetRecentTopics.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Read,
        reason: 'Read chat history for search and recall',
        resources: ['chat-history'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    await this.loadHistory();
    this.loaded = true;
  }

  // ─── History loading ───────────────────────────────────────────────────────

  private async loadHistory(): Promise<void> {
    try {
      await fs.mkdir(this.historyPath, { recursive: true });

      // Load session index
      try {
        const indexData = await fs.readFile(
          path.join(this.historyPath, 'sessions.json'),
          'utf-8',
        );
        const sessionList = JSON.parse(indexData) as ChatSession[];
        for (const session of sessionList) {
          this.sessions.set(session.id, session);
        }
      } catch {
        // No sessions file yet
      }

      // Load messages from individual session files
      for (const [sessionId] of this.sessions) {
        try {
          const messagesFile = path.join(this.historyPath, `${sessionId}.json`);
          const data = await fs.readFile(messagesFile, 'utf-8');
          const sessionMessages = JSON.parse(data) as ChatMessage[];
          this.messages.push(...sessionMessages);
        } catch {
          // Skip unreadable sessions
        }
      }

      // Build search index
      this.buildSearchIndex();

      this.logger.info(
        `Loaded ${this.sessions.size} sessions, ${this.messages.length} messages`,
      );
    } catch (err) {
      this.logger.error('Failed to load chat history', err);
    }
  }

  /** Build a simple token-based search index */
  private buildSearchIndex(): void {
    this.searchIndex.clear();

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      const tokens = this.tokenize(msg.content);

      for (const token of tokens) {
        if (!this.searchIndex.has(token)) {
          this.searchIndex.set(token, new Set());
        }
        this.searchIndex.get(token)!.add(i);
      }
    }
  }

  /** Tokenize text for search indexing */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2); // Skip very short tokens
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  private search(query: string, limit: number): SearchResult[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Score each message by how many query tokens it contains
    const messageScores: Map<number, number> = new Map();

    for (const token of queryTokens) {
      const matchingIndices = this.searchIndex.get(token);
      if (matchingIndices) {
        for (const idx of matchingIndices) {
          messageScores.set(idx, (messageScores.get(idx) || 0) + 1);
        }
      }
    }

    // Sort by score and group by session
    const scoredMessages = Array.from(messageScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit * 3); // Get more than needed for dedup

    // Group results by session
    const resultsBySession: Map<string, SearchResult> = new Map();

    for (const [msgIdx, score] of scoredMessages) {
      const msg = this.messages[msgIdx];
      const session = this.sessions.get(msg.sessionId);

      if (!session) continue;

      if (!resultsBySession.has(msg.sessionId)) {
        resultsBySession.set(msg.sessionId, {
          sessionId: msg.sessionId,
          sessionTitle: session.title,
          matchedMessages: [],
        });
      }

      const result = resultsBySession.get(msg.sessionId)!;
      result.matchedMessages.push({
        role: msg.role,
        content: msg.content.substring(0, 300),
        timestamp: msg.timestamp,
        relevanceScore: score / queryTokens.length,
      });
    }

    return Array.from(resultsBySession.values()).slice(0, limit);
  }

  // ─── Tool implementations ──────────────────────────────────────────────────

  private async executeSearchConversations(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const limit = (args.limit as number) || 10;

    if (!this.loaded) {
      return this.error('Chat history not loaded');
    }

    const results = this.search(query, limit);

    if (results.length === 0) {
      return this.success(
        `No conversations found matching "${query}"`,
        { query, count: 0 },
      );
    }

    const output = results
      .map((result, idx) => {
        const header = `${idx + 1}. 📋 ${result.sessionTitle} (Session: ${result.sessionId.substring(0, 8)}...)`;
        const messages = result.matchedMessages
          .map((m) => `   [${m.role}] ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}`)
          .join('\n');
        return `${header}\n${messages}`;
      })
      .join('\n\n');

    return this.success(output, { query, count: results.length });
  }

  private async executeGetRecentTopics(args: Record<string, unknown>): Promise<ToolResult> {
    const limit = (args.limit as number) || 10;

    if (!this.loaded) {
      return this.error('Chat history not loaded');
    }

    // Get recent sessions sorted by update time
    const recentSessions = Array.from(this.sessions.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    if (recentSessions.length === 0) {
      return this.success('No conversation history available', { count: 0 });
    }

    const output = recentSessions
      .map((session, idx) => {
        const date = new Date(session.updatedAt).toLocaleDateString();
        const tags = session.tags.length > 0 ? ` [${session.tags.join(', ')}]` : '';
        return `${idx + 1}. 📋 ${session.title}${tags}\n   ${session.summary || 'No summary'} — ${date} (${session.messageCount} messages)`;
      })
      .join('\n\n');

    return this.success(output, { count: recentSessions.length });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createChatRecallExtension(): ExtensionConfig {
  return {
    id: 'chat_recall',
    type: ExtensionType.ChatRecall,
    name: 'Chat Recall',
    description: 'Search and recall across all chat session history',
    version: '1.0.0',
    enabled: false,
    settings: {
      historyPath: '',
      maxHistoryAge: '30d',
      indexingEnabled: true,
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
