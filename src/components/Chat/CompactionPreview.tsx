/**
 * OpenAgent-Desktop - Compaction Preview Modal
 *
 * React component for previewing compaction before applying:
 * - Shows messages that will be compacted vs preserved
 * - Token savings estimate
 * - Side-by-side: before/after message count
 * - Compaction strategy description
 * - "Apply Compaction" / "Cancel" buttons
 * - Message type indicators (user, assistant, tool_call, tool_result)
 * - Highlighted messages that will be summarized
 * - Expandable sections for each compacted group
 * - Dark theme with CSS variables
 */

import React, { useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface PreviewMessage {
  /** Unique identifier */
  id: string;
  /** Message role */
  role: MessageRole;
  /** Message content preview */
  contentPreview: string;
  /** Estimated token count */
  tokenCount: number;
  /** Whether this message will be compacted */
  willCompact: boolean;
  /** Whether this message is part of a tool call pair */
  isToolPair: boolean;
  /** Whether this message contains a tool error (preserved for debug) */
  hasError: boolean;
  /** Compaction group ID (messages in same group are compacted together) */
  compactGroup?: string;
}

export interface CompactionPreviewData {
  /** Messages to be compacted */
  messagesToCompact: PreviewMessage[];
  /** Messages to be preserved */
  messagesToPreserve: PreviewMessage[];
  /** Estimated token savings */
  estimatedSavings: number;
  /** Total tokens before compaction */
  tokensBefore: number;
  /** Compaction strategy */
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  /** Number of messages before compaction */
  beforeCount: number;
  /** Estimated number of messages after compaction */
  afterCount: number;
}

interface CompactionPreviewProps {
  /** Preview data to display */
  preview: CompactionPreviewData | null;
  /** Whether the preview is loading */
  isLoading?: boolean;
  /** Whether compaction is being applied */
  isApplying?: boolean;
  /** Callback: apply compaction */
  onApply: () => void;
  /** Callback: cancel */
  onCancel: () => void;
  /** Callback: dismiss */
  onDismiss?: () => void;
}

// ─── Role Config ────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  MessageRole,
  { label: string; color: string; bg: string; icon: string }
> = {
  user: { label: 'User', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: '👤' },
  assistant: { label: 'Assistant', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: '🤖' },
  system: { label: 'System', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', icon: '⚙️' },
  tool: { label: 'Tool', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '🔧' },
};

const STRATEGY_DESCRIPTION: Record<string, { title: string; description: string; icon: string }> = {
  'tool-pair': {
    title: 'Tool-Pair Compaction',
    description: 'Tool call + result pairs are replaced with compact summaries. Preserves conversation flow.',
    icon: '🔗',
  },
  summary: {
    title: 'Summary Compaction',
    description: 'Older messages are replaced with a single summary message. Recent messages are preserved.',
    icon: '📋',
  },
  hybrid: {
    title: 'Hybrid Compaction',
    description: 'First applies tool-pair compaction, then summarizes remaining old messages for maximum savings.',
    icon: '⚡',
  },
};

// ─── Message Item Component ─────────────────────────────────────────────────

const MessageItem: React.FC<{
  message: PreviewMessage;
  isCompactGroup?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  index: number;
}> = ({ message, isCompactGroup, isExpanded, onToggleExpand, index }) => {
  const roleCfg = ROLE_CONFIG[message.role] || ROLE_CONFIG.system;

  return (
    <div
      className="flex items-start gap-2 p-2 rounded-lg transition-colors"
      style={{
        background: message.willCompact
          ? 'rgba(245,158,11,0.06)'
          : message.hasError
          ? 'rgba(239,68,68,0.06)'
          : 'var(--color-bg-tertiary)',
        border: message.willCompact
          ? '1px solid rgba(245,158,11,0.2)'
          : message.hasError
          ? '1px solid rgba(239,68,68,0.2)'
          : '1px solid transparent',
      }}
    >
      {/* Index */}
      <span className="text-[9px] font-mono shrink-0 w-5 text-right" style={{ color: 'var(--color-text-muted)' }}>
        {index + 1}
      </span>

      {/* Role badge */}
      <span
        className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium"
        style={{ background: roleCfg.bg, color: roleCfg.color }}
      >
        {roleCfg.icon} {roleCfg.label}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[10px] truncate"
          style={{
            color: message.willCompact ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
            textDecoration: message.willCompact ? 'line-through' : 'none',
            textDecorationColor: 'var(--color-text-muted)',
          }}
        >
          {message.contentPreview.slice(0, 120)}
          {message.contentPreview.length > 120 ? '...' : ''}
        </div>
      </div>

      {/* Token count */}
      <span className="text-[9px] font-mono shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
        {message.tokenCount}t
      </span>

      {/* Status indicators */}
      <div className="flex items-center gap-1 shrink-0">
        {message.willCompact && (
          <span
            className="text-[8px] px-1 py-0.5 rounded font-medium"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
          >
            Compact
          </span>
        )}
        {message.hasError && (
          <span
            className="text-[8px] px-1 py-0.5 rounded font-medium"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            title="Contains error - preserved for debugging"
          >
            Error
          </span>
        )}
        {message.isToolPair && (
          <span
            className="text-[8px] px-1 py-0.5 rounded font-medium"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}
          >
            Pair
          </span>
        )}
      </div>

      {/* Expand toggle for compact groups */}
      {isCompactGroup && onToggleExpand && (
        <button
          onClick={onToggleExpand}
          className="text-[9px] shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
      )}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const CompactionPreview: React.FC<CompactionPreviewProps> = ({
  preview,
  isLoading = false,
  isApplying = false,
  onApply,
  onCancel,
  onDismiss,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showCompactMessages, setShowCompactMessages] = useState(false);

  const toggleGroup = (groupId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setExpandedGroups(next);
  };

  const strategyInfo = preview
    ? STRATEGY_DESCRIPTION[preview.strategy]
    : null;

  const savingsPercent = preview
    ? preview.tokensBefore > 0
      ? Math.round((preview.estimatedSavings / preview.tokensBefore) * 100)
      : 0
    : 0;

  if (!preview && !isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="rounded-xl border shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        style={{
          background: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-primary)',
          animation: 'fade-in 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--color-border-primary)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🔍</span>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Compaction Preview
            </h3>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <span className="animate-spin-slow inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--color-accent)' }} />
              <div className="text-xs mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                Analyzing messages...
              </div>
            </div>
          </div>
        ) : (
          preview && (
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border-primary) transparent' }}>
              <div className="p-4 space-y-4">
                {/* Strategy description */}
                {strategyInfo && (
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--color-accent-soft)' }}
                  >
                    <span className="text-lg">{strategyInfo.icon}</span>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                        {strategyInfo.title}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                        {strategyInfo.description}
                      </div>
                    </div>
                  </div>
                )}

                {/* Before/After comparison */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="p-3 rounded-lg text-center"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                  >
                    <div className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      Before
                    </div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      {preview.beforeCount}
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      messages
                    </div>
                  </div>
                  <div
                    className="p-3 rounded-lg text-center"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                  >
                    <div className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      After
                    </div>
                    <div className="text-2xl font-bold" style={{ color: '#22c55e' }}>
                      {preview.afterCount}
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      messages
                    </div>
                  </div>
                </div>

                {/* Token savings */}
                <div
                  className="p-3 rounded-lg"
                  style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        Estimated Token Savings
                      </div>
                      <div className="text-lg font-bold" style={{ color: '#22c55e' }}>
                        {preview.estimatedSavings.toLocaleString()} tokens
                      </div>
                    </div>
                    <div
                      className="px-3 py-1.5 rounded-full text-sm font-bold"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                    >
                      -{savingsPercent}%
                    </div>
                  </div>
                  {/* Savings bar */}
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${savingsPercent}%`,
                        background: '#22c55e',
                      }}
                    />
                  </div>
                </div>

                {/* Preserved messages */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs">✅</span>
                    <span className="text-[10px] font-semibold" style={{ color: '#22c55e' }}>
                      Preserved
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      ({preview.messagesToPreserve.length} messages)
                    </span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border-primary) transparent' }}>
                    {preview.messagesToPreserve.map((msg, i) => (
                      <MessageItem key={msg.id} message={msg} index={i} />
                    ))}
                  </div>
                </div>

                {/* Compacted messages */}
                <div>
                  <button
                    onClick={() => setShowCompactMessages(!showCompactMessages)}
                    className="flex items-center gap-2 mb-2 w-full"
                  >
                    <span className="text-xs">⬇️</span>
                    <span className="text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
                      To Be Compacted
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      ({preview.messagesToCompact.length} messages)
                    </span>
                    <span
                      className="text-[10px] ml-auto transition-transform"
                      style={{
                        color: 'var(--color-text-tertiary)',
                        transform: showCompactMessages ? 'rotate(90deg)' : 'rotate(0)',
                      }}
                    >
                      ▸
                    </span>
                  </button>

                  {showCompactMessages && (
                    <div className="space-y-1 max-h-48 overflow-y-auto animate-fade-in" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border-primary) transparent' }}>
                      {/* Group messages by compactGroup if available */}
                      {(() => {
                        // Group by compactGroup
                        const groups = new Map<string, PreviewMessage[]>();
                        const ungrouped: PreviewMessage[] = [];

                        for (const msg of preview.messagesToCompact) {
                          if (msg.compactGroup) {
                            if (!groups.has(msg.compactGroup)) {
                              groups.set(msg.compactGroup, []);
                            }
                            groups.get(msg.compactGroup)!.push(msg);
                          } else {
                            ungrouped.push(msg);
                          }
                        }

                        const elements: React.ReactNode[] = [];

                        // Render grouped messages
                        for (const [groupId, groupMessages] of groups) {
                          const isExpanded = expandedGroups.has(groupId);
                          elements.push(
                            <div key={groupId} className="rounded-lg border" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
                              <button
                                onClick={() => toggleGroup(groupId)}
                                className="flex items-center gap-2 p-2 w-full text-left"
                                style={{ background: 'rgba(245,158,11,0.04)' }}
                              >
                                <span
                                  className="text-[9px] transition-transform"
                                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}
                                >
                                  ▸
                                </span>
                                <span className="text-[9px] font-medium" style={{ color: '#f59e0b' }}>
                                  Group {groupId}
                                </span>
                                <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                                  {groupMessages.length} msgs · {groupMessages.reduce((s, m) => s + m.tokenCount, 0)} tokens
                                </span>
                              </button>
                              {isExpanded && (
                                <div className="p-1 space-y-0.5 border-t animate-fade-in" style={{ borderColor: 'rgba(245,158,11,0.1)' }}>
                                  {groupMessages.map((msg, i) => (
                                    <MessageItem key={msg.id} message={msg} index={i} />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Render ungrouped messages
                        for (const msg of ungrouped) {
                          elements.push(
                            <MessageItem
                              key={msg.id}
                              message={msg}
                              index={elements.length}
                              isCompactGroup={!!msg.compactGroup}
                              isExpanded={expandedGroups.has(msg.compactGroup || '')}
                              onToggleExpand={() => msg.compactGroup && toggleGroup(msg.compactGroup)}
                            />
                          );
                        }

                        return elements;
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* Action buttons */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0"
          style={{ borderColor: 'var(--color-border-primary)' }}
        >
          <button
            onClick={onCancel}
            disabled={isApplying}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-primary)',
              opacity: isApplying ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={isApplying || !preview}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: isApplying ? 'var(--color-bg-tertiary)' : 'var(--color-accent)',
              color: isApplying ? 'var(--color-text-tertiary)' : '#fff',
              opacity: isApplying || !preview ? 0.5 : 1,
            }}
          >
            {isApplying ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin-slow inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                Applying...
              </span>
            ) : (
              'Apply Compaction'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompactionPreview;
