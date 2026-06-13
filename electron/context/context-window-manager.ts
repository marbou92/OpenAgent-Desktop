/**
 * OpenAgent-Desktop - Context Window Manager
 *
 * Manages context window allocation across different message types.
 * Tracks token budgets for system prompt, tools, conversation, and memory.
 * Like OpenCode's session compaction and context management.
 */

import { ContextUsage } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextBudget {
  /** Tokens allocated for system prompt */
  systemPrompt: number;
  /** Tokens allocated for tool definitions */
  tools: number;
  /** Tokens allocated for conversation history */
  conversation: number;
  /** Tokens allocated for memory context */
  memory: number;
  /** Reserved tokens for safety margin */
  reserved: number;
  /** Total context window size */
  total: number;
}

export interface ContextAllocation {
  /** The budget allocation */
  budget: ContextBudget;
  /** Total tokens currently used */
  used: number;
  /** Remaining tokens available */
  remaining: number;
  /** Token usage breakdown by type */
  usageByType: {
    systemPrompt: number;
    tools: number;
    conversation: number;
    memory: number;
  };
}

export type RecommendedAction = 'none' | 'compact' | 'summarize' | 'truncate' | 'error';

// ─── Known Model Context Windows ────────────────────────────────────────────

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  'claude-sonnet-4-5': 200000,
  'claude-sonnet-4': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  // OpenAI
  'gpt-5': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o1-pro': 200000,
  'o3': 200000,
  'o3-mini': 128000,
  // Google
  'gemini-3-pro': 1000000,
  'gemini-2.5-pro': 1000000,
  'gemini-2.0-flash': 1000000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.0-pro': 32768,
  // Meta
  'llama-3-70b': 8192,
  'llama-3-8b': 8192,
  'llama-3.1-405b': 128000,
  'llama-3.1-70b': 128000,
  'llama-3.1-8b': 128000,
  'llama-3.2-90b': 128000,
  'llama-3.3-70b': 128000,
  // Mistral
  'mistral-large': 128000,
  'mistral-medium': 32768,
  'mistral-small': 32768,
  'codestral': 32768,
  // Groq
  'llama-3.1-8b-instant': 131072,
  'llama-3.2-3b-instant': 131072,
  'mixtral-8x7b': 32768,
  // Other
  'deepseek-v3': 128000,
  'deepseek-r1': 128000,
  'qwen-2.5-72b': 131072,
  'command-r-plus': 128000,
  'command-r': 128000,
};

// ─── Default Budget Percentages ─────────────────────────────────────────────

const DEFAULT_BUDGET_PERCENTAGES = {
  systemPrompt: 0.05,  // 5%
  tools: 0.10,         // 10%
  memory: 0.05,        // 5%
  conversation: 0.70,  // 70%
  reserved: 0.10,      // 10%
};

// ─── Context Window Manager ────────────────────────────────────────────────

export class ContextWindowManager {
  /** Context window sizes per model */
  private modelContextWindows: Map<string, number> = new Map();
  /** Per-session context window overrides */
  private sessionOverrides: Map<string, { modelId: string; maxTokens: number }> = new Map();
  /** Budget percentage overrides per session */
  private sessionBudgetOverrides: Map<string, Partial<typeof DEFAULT_BUDGET_PERCENTAGES>> = new Map();

  constructor() {
    // Load known model context windows
    for (const [model, tokens] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      this.modelContextWindows.set(model, tokens);
    }
  }

  // ─── Configuration ──────────────────────────────────────────────────────

  /** Set context window size for a model */
  setContextWindow(modelId: string, maxTokens: number): void {
    this.modelContextWindows.set(modelId, maxTokens);
  }

  /** Set session-specific context window */
  setSessionContextWindow(sessionId: string, modelId: string, maxTokens: number): void {
    this.sessionOverrides.set(sessionId, { modelId, maxTokens });
  }

  /** Set session-specific budget percentages */
  setSessionBudgetPercentages(
    sessionId: string,
    percentages: Partial<typeof DEFAULT_BUDGET_PERCENTAGES>
  ): void {
    this.sessionBudgetOverrides.set(sessionId, percentages);
  }

  /** Get context window size for a model */
  getContextWindow(modelId: string): number {
    // Exact match
    if (this.modelContextWindows.has(modelId)) {
      return this.modelContextWindows.get(modelId)!;
    }

    // Fuzzy match: check if modelId contains a known model name
    const normalizedId = modelId.toLowerCase();
    for (const [knownModel, tokens] of this.modelContextWindows) {
      if (normalizedId.includes(knownModel.toLowerCase())) {
        return tokens;
      }
    }

    // Reverse: check if known model name is in modelId
    for (const [knownModel, tokens] of this.modelContextWindows) {
      if (modelId.toLowerCase().includes(knownModel.split('-')[0].toLowerCase())) {
        // Partial match on provider family
        const family = knownModel.split('-')[0];
        if (normalizedId.includes(family)) {
          return tokens;
        }
      }
    }

    // Default fallback: 128K (common for modern models)
    return 128000;
  }

  // ─── Budget & Allocation ────────────────────────────────────────────────

  /** Get allocated budget for a session */
  getBudget(sessionId: string): ContextBudget {
    const override = this.sessionOverrides.get(sessionId);
    const modelId = override ? override.modelId : 'default';
    const maxTokens = override
      ? override.maxTokens
      : this.getContextWindow(modelId);

    const percentages = {
      ...DEFAULT_BUDGET_PERCENTAGES,
      ...this.sessionBudgetOverrides.get(sessionId),
    };

    return {
      systemPrompt: Math.round(maxTokens * percentages.systemPrompt),
      tools: Math.round(maxTokens * percentages.tools),
      conversation: Math.round(maxTokens * percentages.conversation),
      memory: Math.round(maxTokens * percentages.memory),
      reserved: Math.round(maxTokens * percentages.reserved),
      total: maxTokens,
    };
  }

  /** Calculate current allocation for a session */
  allocate(
    sessionId: string,
    messages: any[],
    tools: any[],
    systemPrompt: string,
    memories: string[]
  ): ContextAllocation {
    const budget = this.getBudget(sessionId);

    const systemPromptTokens = this.estimateTokens({ content: systemPrompt });
    const toolsTokens = this.estimateToolDefinitions(tools);
    const conversationTokens = messages.reduce(
      (sum, m) => sum + this.estimateTokens(m),
      0
    );
    const memoryTokens = memories.reduce(
      (sum, mem) => sum + this.estimateTokens({ content: mem }),
      0
    );

    const used = systemPromptTokens + toolsTokens + conversationTokens + memoryTokens;
    const remaining = budget.total - budget.reserved - used;

    return {
      budget,
      used,
      remaining: Math.max(0, remaining),
      usageByType: {
        systemPrompt: systemPromptTokens,
        tools: toolsTokens,
        conversation: conversationTokens,
        memory: memoryTokens,
      },
    };
  }

  /** Check if additional tokens can fit in the context window */
  canFit(sessionId: string, additionalTokens: number): boolean {
    const budget = this.getBudget(sessionId);
    // We need at least the reserved space to be available
    const availableSpace = budget.total - budget.reserved;
    // This is a rough check; real usage would need to account for current usage
    return additionalTokens <= availableSpace;
  }

  /** Check if additional tokens fit given current allocation */
  canFitInAllocation(allocation: ContextAllocation, additionalTokens: number): boolean {
    return allocation.remaining >= additionalTokens;
  }

  // ─── Recommendations ────────────────────────────────────────────────────

  /** Recommend action based on usage percentage */
  getRecommendedAction(sessionId: string, usage: ContextUsage): RecommendedAction {
    const percent = usage.usagePercent;

    if (percent < 0.6) {
      return 'none';
    }

    if (percent < 0.8) {
      return 'compact';
    }

    if (percent < 0.9) {
      return 'summarize';
    }

    if (percent < 0.95) {
      return 'truncate';
    }

    return 'error';
  }

  /** Get recommended action based on allocation */
  getRecommendedActionFromAllocation(allocation: ContextAllocation): RecommendedAction {
    const budget = allocation.budget;
    const usableTotal = budget.total - budget.reserved;
    const usagePercent = allocation.used / usableTotal;

    if (usagePercent < 0.6) {
      return 'none';
    }
    if (usagePercent < 0.8) {
      return 'compact';
    }
    if (usagePercent < 0.9) {
      return 'summarize';
    }
    if (usagePercent < 0.95) {
      return 'truncate';
    }
    return 'error';
  }

  // ─── Utility Methods ───────────────────────────────────────────────────

  /** Get all known model context windows */
  getKnownModels(): { model: string; contextWindow: number }[] {
    return Array.from(this.modelContextWindows.entries()).map(([model, contextWindow]) => ({
      model,
      contextWindow,
    }));
  }

  /** Create a ContextUsage object from an allocation */
  createContextUsage(allocation: ContextAllocation): ContextUsage {
    const budget = allocation.budget;
    const usableTotal = budget.total - budget.reserved;
    const usagePercent = Math.min(allocation.used / usableTotal, 1.0);

    return {
      totalTokens: allocation.used,
      maxTokens: usableTotal,
      usagePercent,
      promptTokens: allocation.used,
      completionTokens: 0,
      canCompact: usagePercent >= 0.5,
    };
  }

  /** Clean up session data */
  removeSession(sessionId: string): void {
    this.sessionOverrides.delete(sessionId);
    this.sessionBudgetOverrides.delete(sessionId);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /** Estimate tokens for a message (~4 chars per token) */
  private estimateTokens(msg: any): number {
    const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content || '');
    return Math.ceil(content.length / 4);
  }

  /** Estimate token count for tool definitions */
  private estimateToolDefinitions(tools: any[]): number {
    if (!tools || tools.length === 0) return 0;

    let totalTokens = 0;
    for (const tool of tools) {
      // Each tool definition includes name, description, and parameter schema
      const toolStr = JSON.stringify(tool);
      totalTokens += Math.ceil(toolStr.length / 4);
    }

    // Add overhead for the tool use formatting
    totalTokens += tools.length * 10; // ~10 tokens overhead per tool
    return totalTokens;
  }
}
