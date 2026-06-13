/**
 * OpenAgent-Desktop - Session Operations View Component
 *
 * React component for advanced session operations:
 * - Session timeline with fork points marked
 * - Fork button at each message: "Fork from here"
 * - Branch visualization: tree diagram showing forks
 * - Revert button at each message: "Revert to here"
 * - Unrevert button in toolbar
 * - Share dialog: generate share URL, set expiration, copy link
 * - Compare view: side-by-side session comparison with diffs highlighted
 * - Session tagging: add/remove tags
 * - Search across sessions
 * - Export options: JSON, Markdown
 * - Session history list
 * - Dark theme
 */

import React, { useState, useEffect, useCallback } from 'react';

const api = (window as any).openagent;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionBranch {
  id: string;
  parentId: string;
  name: string;
  forkedAtMessageIndex: number;
  createdAt: string;
}

interface SessionDiff {
  type: 'added' | 'removed' | 'modified';
  messageIndex: number;
  content: string;
  side: 'left' | 'right' | 'both';
}

interface SessionHistoryEntry {
  id: string;
  sessionId: string;
  operation: 'fork' | 'revert' | 'unrevert' | 'share' | 'branch' | 'merge' | 'tag' | 'export';
  timestamp: string;
  details: Record<string, unknown>;
}

interface SessionTag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
}

interface ForkTreeNode {
  sessionId: string;
  name: string;
  forkedAtIndex?: number;
  children: ForkTreeNode[];
}

interface SessionOpsViewProps {
  currentSessionId: string | null;
  messages: SessionMessage[];
  onLoadSession: (sessionId: string) => void;
  onNewSession: () => void;
  addToast: (toast: { type: 'success' | 'error' | 'info'; title: string; message?: string }) => void;
}

type ViewMode = 'timeline' | 'branches' | 'compare' | 'history' | 'search';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
];

const OPERATION_ICONS: Record<string, string> = {
  fork: '🔀',
  revert: '⏪',
  unrevert: '⏩',
  share: '🔗',
  branch: '🌿',
  merge: '🔗',
  tag: '🏷️',
  export: '📤',
};

// ─── Component ─────────────────────────────────────────────────────────────────

const SessionOpsView: React.FC<SessionOpsViewProps> = ({
  currentSessionId,
  messages,
  onLoadSession,
  _onNewSession,
  addToast,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [branches, setBranches] = useState<SessionBranch[]>([]);
  const [tags, setTags] = useState<SessionTag[]>([]);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareToken, setShareToken] = useState('');
  const [shareExpiry, setShareExpiry] = useState(7);
  const [_showCompareDialog, _setShowCompareDialog] = useState(false);
  const [compareSessionId1, setCompareSessionId1] = useState('');
  const [compareSessionId2, setCompareSessionId2] = useState('');
  const [compareResult, setCompareResult] = useState<{
    differences: SessionDiff[];
    summary: { addedCount: number; removedCount: number; modifiedCount: number };
  } | null>(null);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    sessionId: string;
    matchCount: number;
    matchedIndices: number[];
  }>>([]);
  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null);
  const [forkTree, setForkTree] = useState<ForkTreeNode | null>(null);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadSessionData = useCallback(async () => {
    if (!currentSessionId) return;

    try {
      // Load branches
      if (api?.sessionOps?.getBranches) {
        const branchData = await api.sessionOps.getBranches(currentSessionId);
        setBranches(branchData || []);
      }

      // Load tags
      if (api?.sessionOps?.getTags) {
        const tagData = await api.sessionOps.getTags(currentSessionId);
        setTags(tagData || []);
      }

      // Load history
      if (api?.sessionOps?.getHistory) {
        const historyData = await api.sessionOps.getHistory(currentSessionId);
        setHistory(historyData || []);
      }

      // Load fork tree
      if (api?.sessionOps?.getForkTree) {
        const tree = await api.sessionOps.getForkTree(currentSessionId);
        setForkTree(tree || null);
      }
    } catch (err: any) {
      // Silently fail - API may not be available
    }
  }, [currentSessionId]);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleFork = async (atMessageIndex: number) => {
    if (!currentSessionId || !api?.sessionOps?.fork) return;
    try {
      const result = await api.sessionOps.fork(currentSessionId, atMessageIndex);
      addToast({
        type: 'success',
        title: 'Session forked',
        message: `Forked at message ${atMessageIndex + 1}`,
      });
      if (result?.forkedSessionId) {
        onLoadSession(result.forkedSessionId);
      }
      loadSessionData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Fork failed', message: err.message });
    }
  };

  const handleRevert = async (atMessageIndex: number) => {
    if (!currentSessionId || !api?.sessionOps?.revert) return;
    if (!confirm(`Revert to message ${atMessageIndex + 1}? Messages after this point will be removed.`)) return;
    try {
      await api.sessionOps.revert(currentSessionId, atMessageIndex);
      addToast({
        type: 'info',
        title: 'Session reverted',
        message: `Reverted to message ${atMessageIndex + 1}`,
      });
      loadSessionData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Revert failed', message: err.message });
    }
  };

  const handleUnrevert = async (revertId: string) => {
    if (!currentSessionId || !api?.sessionOps?.unrevert) return;
    try {
      await api.sessionOps.unrevert(currentSessionId, revertId);
      addToast({ type: 'success', title: 'Revert undone' });
      loadSessionData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Unrevert failed', message: err.message });
    }
  };

  const handleShare = async () => {
    if (!currentSessionId || !api?.sessionOps?.share) return;
    try {
      const result = await api.sessionOps.share(currentSessionId, shareExpiry);
      setShareUrl(result.shareUrl);
      setShareToken(result.shareToken);
      addToast({ type: 'success', title: 'Session shared' });
      loadSessionData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Share failed', message: err.message });
    }
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    addToast({ type: 'info', title: 'Link copied to clipboard' });
  };

  const handleBranch = async (atMessageIndex: number) => {
    if (!currentSessionId || !api?.sessionOps?.branch) return;
    const name = prompt('Branch name:');
    if (!name) return;
    try {
      await api.sessionOps.branch(currentSessionId, atMessageIndex, name);
      addToast({ type: 'success', title: 'Branch created', message: name });
      loadSessionData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Branch failed', message: err.message });
    }
  };

  const handleCompare = async () => {
    if (!api?.sessionOps?.compare) return;
    try {
      const result = await api.sessionOps.compare(compareSessionId1, compareSessionId2);
      setCompareResult(result);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Compare failed', message: err.message });
    }
  };

  const handleAddTag = async () => {
    if (!currentSessionId || !newTagName.trim() || !api?.sessionOps?.addTag) return;
    try {
      await api.sessionOps.addTag(currentSessionId, newTagName.trim(), newTagColor);
      setNewTagName('');
      setShowTagInput(false);
      loadSessionData();
      addToast({ type: 'success', title: 'Tag added' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add tag', message: err.message });
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!currentSessionId || !api?.sessionOps?.removeTag) return;
    try {
      await api.sessionOps.removeTag(currentSessionId, tagId);
      loadSessionData();
      addToast({ type: 'info', title: 'Tag removed' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove tag', message: err.message });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !api?.sessionOps?.searchAcrossSessions) return;
    try {
      const results = await api.sessionOps.searchAcrossSessions(searchQuery);
      setSearchResults(results);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Search failed', message: err.message });
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    if (!currentSessionId) return;
    try {
      let content: string;
      if (format === 'markdown' && api?.sessionOps?.exportMarkdown) {
        content = await api.sessionOps.exportMarkdown(currentSessionId);
      } else {
        content = JSON.stringify({ id: currentSessionId, messages }, null, 2);
      }

      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/markdown',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${currentSessionId}.${format === 'json' ? 'json' : 'md'}`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ type: 'success', title: `Exported as ${format}` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Export failed', message: err.message });
    }
  };

  // ─── Render: Timeline ─────────────────────────────────────────────────────

  const renderTimeline = () => (
    <div className="space-y-1">
      {messages.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-30">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p>No messages in this session</p>
          <p className="text-xs mt-1">Send a message to start the timeline</p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isForkPoint = branches.some((b) => b.forkedAtMessageIndex === index);
          const roleIcon =
            msg.role === 'user' ? '👤' :
            msg.role === 'assistant' ? '🤖' :
            msg.role === 'system' ? '⚙️' : '🔧';

          const roleColor =
            msg.role === 'user' ? '#3b82f6' :
            msg.role === 'assistant' ? '#22c55e' :
            msg.role === 'system' ? '#f59e0b' : '#8b5cf6';

          return (
            <div
              key={msg.id}
              className="relative"
              onMouseEnter={() => setHoveredMessageIndex(index)}
              onMouseLeave={() => setHoveredMessageIndex(null)}
            >
              {/* Fork indicator */}
              {isForkPoint && (
                <div
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-xs z-10"
                  style={{ background: '#f97316', color: 'white' }}
                  title="Fork point"
                >
                  🔀
                </div>
              )}

              {/* Message row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                style={{
                  background: hoveredMessageIndex === index ? 'var(--color-bg-secondary)' : 'transparent',
                }}
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                    style={{ background: roleColor + '20', color: roleColor }}
                  >
                    {roleIcon}
                  </div>
                  {index < messages.length - 1 && (
                    <div
                      className="w-0.5 h-4 mt-1"
                      style={{ background: 'var(--color-border-primary)' }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-medium uppercase"
                      style={{ color: roleColor }}
                    >
                      {msg.role}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      #{index + 1}
                    </span>
                    {isForkPoint && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#f9731620', color: '#f97316' }}>
                        fork
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm truncate mt-0.5"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {msg.content.slice(0, 120)}{msg.content.length > 120 ? '...' : ''}
                  </p>
                </div>

                {/* Actions on hover */}
                {hoveredMessageIndex === index && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleFork(index)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#f97316' }}
                      title="Fork from here"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="6" y1="3" x2="6" y2="15" />
                        <circle cx="18" cy="6" r="3" />
                        <circle cx="6" cy="18" r="3" />
                        <path d="M18 9a9 9 0 0 1-9 9" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleBranch(index)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#22c55e' }}
                      title="Branch from here"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="6" y1="3" x2="6" y2="15" />
                        <circle cx="18" cy="6" r="3" />
                        <circle cx="6" cy="18" r="3" />
                        <path d="M18 9a9 9 0 0 1-9 9" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRevert(index)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#ef4444' }}
                      title="Revert to here"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  // ─── Render: Branches ─────────────────────────────────────────────────────

  const renderForkTree = (node: ForkTreeNode, depth = 0): React.ReactNode => (
    <div key={node.sessionId}>
      <div
        className="flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
        style={{
          marginLeft: depth * 24,
          background: node.sessionId === currentSessionId ? 'var(--color-accent-soft)' : 'transparent',
        }}
        onClick={() => onLoadSession(node.sessionId)}
      >
        {depth > 0 && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        )}
        <span className="text-sm font-medium" style={{ color: node.sessionId === currentSessionId ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
          {node.name}
        </span>
        {node.forkedAtIndex !== undefined && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            @msg {node.forkedAtIndex + 1}
          </span>
        )}
      </div>
      {node.children.map((child) => renderForkTree(child, depth + 1))}
    </div>
  );

  const renderBranches = () => (
    <div className="space-y-4">
      {forkTree ? (
        <div
          className="rounded-xl p-5 border"
          style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Fork Tree
          </h3>
          {renderForkTree(forkTree)}
        </div>
      ) : (
        <div
          className="rounded-xl p-5 border"
          style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
        >
          <div className="text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-30">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <p>No forks yet</p>
            <p className="text-xs mt-1">Use the fork button on messages to create branches</p>
          </div>
        </div>
      )}

      {/* Branches List */}
      {branches.length > 0 && (
        <div
          className="rounded-xl p-5 border"
          style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            All Branches
          </h3>
          <div className="space-y-2">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between p-3 rounded-lg cursor-pointer"
                style={{ background: 'var(--color-bg-primary)' }}
                onClick={() => onLoadSession(branch.id)}
              >
                <div className="flex items-center gap-2">
                  <span>🌿</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {branch.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    @msg {branch.forkedAtMessageIndex + 1}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {new Date(branch.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Render: Compare ──────────────────────────────────────────────────────

  const renderCompare = () => (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Compare Sessions
        </h3>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={compareSessionId1}
            onChange={(e) => setCompareSessionId1(e.target.value)}
            placeholder="Session ID 1"
            className="flex-1 px-3 py-2 rounded-lg font-mono text-sm"
            style={{
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-primary)',
            }}
          />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>vs</span>
          <input
            type="text"
            value={compareSessionId2}
            onChange={(e) => setCompareSessionId2(e.target.value)}
            placeholder="Session ID 2"
            className="flex-1 px-3 py-2 rounded-lg font-mono text-sm"
            style={{
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-primary)',
            }}
          />
          <button
            onClick={handleCompare}
            disabled={!compareSessionId1.trim() || !compareSessionId2.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: compareSessionId1.trim() && compareSessionId2.trim() ? 'var(--color-accent)' : 'var(--color-bg-primary)',
              color: compareSessionId1.trim() && compareSessionId2.trim() ? 'white' : 'var(--color-text-muted)',
            }}
          >
            Compare
          </button>
        </div>

        {compareResult && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-sm" style={{ color: '#22c55e' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                +{compareResult.summary.addedCount} added
              </span>
              <span className="flex items-center gap-1 text-sm" style={{ color: '#ef4444' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                -{compareResult.summary.removedCount} removed
              </span>
              <span className="flex items-center gap-1 text-sm" style={{ color: '#f59e0b' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                ~{compareResult.summary.modifiedCount} modified
              </span>
            </div>

            {/* Diff list */}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {compareResult.differences.map((diff, idx) => {
                const bgColor =
                  diff.type === 'added' ? '#22c55e10' :
                  diff.type === 'removed' ? '#ef444410' :
                  '#f59e0b10';
                const textColor =
                  diff.type === 'added' ? '#22c55e' :
                  diff.type === 'removed' ? '#ef4444' :
                  '#f59e0b';
                const prefix =
                  diff.type === 'added' ? '+' :
                  diff.type === 'removed' ? '-' : '~';

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg text-sm font-mono"
                    style={{ background: bgColor, color: textColor }}
                  >
                    <span className="font-bold mr-2">{prefix}</span>
                    <span className="text-xs opacity-60 mr-2">msg #{diff.messageIndex + 1}</span>
                    <span className="truncate">{diff.content.slice(0, 100)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Render: History ──────────────────────────────────────────────────────

  const renderHistory = () => (
    <div className="space-y-3">
      {history.length > 0 ? (
        history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--color-bg-secondary)' }}
          >
            <span className="text-lg">{OPERATION_ICONS[entry.operation] || '📌'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium capitalize" style={{ color: 'var(--color-text-primary)' }}>
                  {entry.operation}
                </span>
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                {Object.entries(entry.details)
                  .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                  .join(' • ')}
              </p>
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(entry.timestamp).toLocaleString()}
            </span>
          </div>
        ))
      ) : (
        <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-30">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p>No history yet</p>
          <p className="text-xs mt-1">Operations like fork, revert, and share will appear here</p>
        </div>
      )}

      {/* Unrevert buttons from history */}
      {history
        .filter((e) => e.operation === 'revert')
        .map((entry) => (
          <div key={`unrevert-${entry.id}`} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-bg-primary)' }}>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Revert at msg #{(entry.details.revertedAtMessageIndex as number) + 1}
            </span>
            <button
              onClick={() => handleUnrevert(entry.details.revertId as string)}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40' }}
            >
              Unrevert
            </button>
          </div>
        ))}
    </div>
  );

  // ─── Render: Search ───────────────────────────────────────────────────────

  const renderSearch = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search across all sessions..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          Search
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((result) => (
            <div
              key={result.sessionId}
              className="flex items-center justify-between p-4 rounded-xl border cursor-pointer"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
              onClick={() => onLoadSession(result.sessionId)}
            >
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {result.sessionId}
                </span>
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  {result.matchCount} match{result.matchCount !== 1 ? 'es' : ''} in messages {result.matchedIndices.slice(0, 5).map((i) => `#${i + 1}`).join(', ')}
                  {result.matchedIndices.length > 5 ? '...' : ''}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Main Render ───────────────────────────────────────────────────────────

  const VIEW_TABS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    {
      id: 'timeline',
      label: 'Timeline',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      ),
    },
    {
      id: 'branches',
      label: 'Branches',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      ),
    },
    {
      id: 'compare',
      label: 'Compare',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="5" width="9" height="14" rx="1" />
          <rect x="14" y="5" width="9" height="14" rx="1" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: 'History',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: 'search',
      label: 'Search',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Session Operations</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {currentSessionId ? `Session: ${currentSessionId.slice(0, 16)}...` : 'No active session'}
              {' • '}{messages.length} messages
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tags */}
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer"
                style={{ background: (tag.color || '#6b7280') + '20', color: tag.color || '#6b7280' }}
                onClick={() => handleRemoveTag(tag.id)}
                title="Click to remove"
              >
                {tag.name}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
            ))}

            {/* Add tag */}
            {showTagInput ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Tag name"
                  className="w-20 px-2 py-0.5 rounded text-xs"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
                  autoFocus
                />
                <div className="flex items-center gap-0.5">
                  {TAG_COLORS.slice(0, 5).map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className="w-3 h-3 rounded-full"
                      style={{ background: color, outline: newTagColor === color ? '2px solid white' : 'none', outlineOffset: '1px' }}
                    />
                  ))}
                </div>
                <button
                  onClick={handleAddTag}
                  disabled={!newTagName.trim()}
                  className="px-2 py-0.5 rounded text-xs"
                  style={{ background: 'var(--color-accent)', color: 'white', opacity: newTagName.trim() ? 1 : 0.5 }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowTagInput(true)}
                className="text-xs px-2 py-0.5 rounded"
                style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border-primary)' }}
              >
                + Tag
              </button>
            )}

            {/* Share button */}
            <button
              onClick={() => setShowShareDialog(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>

            {/* Export buttons */}
            <button
              onClick={() => handleExport('json')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
            >
              JSON
            </button>
            <button
              onClick={() => handleExport('markdown')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
            >
              MD
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div
          className="flex items-center gap-1 mb-6 p-1 rounded-xl"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center"
              style={{
                background: viewMode === tab.id ? 'var(--color-bg-primary)' : 'transparent',
                color: viewMode === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                boxShadow: viewMode === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* View content */}
        {viewMode === 'timeline' && renderTimeline()}
        {viewMode === 'branches' && renderBranches()}
        {viewMode === 'compare' && renderCompare()}
        {viewMode === 'history' && renderHistory()}
        {viewMode === 'search' && renderSearch()}
      </div>

      {/* Share Dialog */}
      {showShareDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full mx-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              Share Session
            </h3>

            {!shareUrl ? (
              <>
                <div className="mb-4">
                  <label className="text-sm mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Expires in (days)
                  </label>
                  <input
                    type="number"
                    value={shareExpiry}
                    onChange={(e) => setShareExpiry(parseInt(e.target.value) || 7)}
                    min={1}
                    max={365}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--color-bg-primary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowShareDialog(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleShare}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--color-accent)', color: 'white' }}
                  >
                    Generate Share Link
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="text-sm mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Share URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
                      style={{
                        background: 'var(--color-bg-primary)',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-primary)',
                      }}
                    />
                    <button
                      onClick={handleCopyShareLink}
                      className="px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--color-accent)', color: 'white' }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Token: <span className="font-mono">{shareToken}</span>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => { setShowShareDialog(false); setShareUrl(''); setShareToken(''); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionOpsView;
