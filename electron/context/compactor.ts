/**
 * OpenAgent-Desktop - Context Auto-Compactor
 * 
 * Automatically compacts conversation context when usage exceeds threshold.
 * Like Goose: auto-compact at 80% context usage.
 * Supports tool-pair summarization and full summary strategies.
 */

import { EventEmitter } from 'events';
import { ContextUsage, CompactionResult, CompactionConfig, ToolPairSummary } from './types';

export class ContextCompactor extends EventEmitter {
  private config: CompactionConfig;

  constructor(config?: Partial<CompactionConfig>) {
    super();
    this.config = {
      threshold: config?.threshold ?? 0.8,
      strategy: config?.strategy ?? 'hybrid',
      preserveRecentMessages: config?.preserveRecentMessages ?? 4,
      maxCompactionAttempts: config?.maxCompactionAttempts ?? 2,
    };
  }

  shouldCompact(usage: ContextUsage): boolean {
    return usage.usagePercent >= this.config.threshold && usage.canCompact;
  }

  compactToolPairs(messages: any[]): { compacted: any[]; summaries: ToolPairSummary[] } {
    const summaries: ToolPairSummary[] = [];
    const result: any[] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];
      
      // Look for tool call + tool result pairs
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const toolCallMsg = msg;
        const nextMsg = messages[i + 1];
        
        if (nextMsg && nextMsg.role === 'tool') {
          // Create summary of the tool pair
          const summary: ToolPairSummary = {
            toolCallSummary: this.summarizeToolCall(toolCallMsg),
            toolResultSummary: this.summarizeToolResult(nextMsg),
            originalTokens: this.estimateTokens(toolCallMsg) + this.estimateTokens(nextMsg),
            summaryTokens: 0,
          };
          summary.summaryTokens = this.estimateTokens({ content: summary.toolCallSummary + summary.toolResultSummary });

          summaries.push(summary);

          // Replace pair with compacted version
          result.push({
            ...toolCallMsg,
            content: `[Compacted] ${summary.toolCallSummary} → ${summary.toolResultSummary}`,
            toolCalls: undefined,
            _compacted: true,
          });
          
          i += 2; // Skip the tool result message
          continue;
        }
      }
      
      result.push(msg);
      i++;
    }

    return { compacted: result, summaries };
  }

  compactSummary(messages: any[], preserveRecent: number = this.config.preserveRecentMessages): { compacted: any[]; summaryText: string } {
    if (messages.length <= preserveRecent) {
      return { compacted: messages, summaryText: '' };
    }

    const toSummarize = messages.slice(0, -preserveRecent);
    const recent = messages.slice(-preserveRecent);

    // Create a summary of older messages
    const summaryText = this.createConversationSummary(toSummarize);
    
    const summaryMessage = {
      role: 'system' as const,
      content: `[Context Summary] The following is a summary of earlier conversation:\n\n${summaryText}`,
      _compacted: true,
    };

    return {
      compacted: [summaryMessage, ...recent],
      summaryText,
    };
  }

  compact(messages: any[], usage: ContextUsage): { compacted: any[]; result: CompactionResult } {
    const originalTokens = usage.totalTokens;

    let compacted: any[];

    switch (this.config.strategy) {
      case 'tool-pair':
        ({ compacted } = this.compactToolPairs(messages));
        break;
      case 'summary':
        ({ compacted } = this.compactSummary(messages));
        break;
      case 'hybrid':
      default: {
        // First pass: tool-pair compaction
        const toolPairResult = this.compactToolPairs(messages);
        // Second pass: summary compaction if still over threshold
        compacted = this.compactSummary(toolPairResult.compacted).compacted;
        break;
      }
    }

    const compactedTokenCount = Math.round(originalTokens * (compacted.length / Math.max(messages.length, 1)));
    const result: CompactionResult = {
      originalTokenCount: originalTokens,
      compactedTokenCount,
      savedTokens: originalTokens - compactedTokenCount,
      compactedAt: new Date().toISOString(),
      strategy: this.config.strategy,
    };

    this.emit('compacted', result);
    return { compacted, result };
  }

  private summarizeToolCall(msg: any): string {
    if (!msg.toolCalls) return '';
    return msg.toolCalls.map((tc: any) => `${tc.name}(${JSON.stringify(tc.arguments).slice(0, 200)})`).join('; ');
  }

  private summarizeToolResult(msg: any): string {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return content.length > 300 ? content.slice(0, 300) + '...' : content;
  }

  private createConversationSummary(messages: any[]): string {
    const parts: string[] = [];
    for (const msg of messages) {
      if (msg._compacted) continue;
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content.length > 0) {
        const truncated = content.length > 150 ? content.slice(0, 150) + '...' : content;
        parts.push(`[${msg.role}]: ${truncated}`);
      }
    }
    return parts.join('\n');
  }

  private estimateTokens(msg: any): number {
    const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content || '');
    return Math.ceil(content.length / 4); // Rough estimate: ~4 chars per token
  }
}
