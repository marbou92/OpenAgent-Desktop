/**
 * OpenAgent-Desktop — Per-Tool UI Renderers (Phase 2.1)
 *
 * A registry of specialized render components for each tool type.
 * Each renderer shows tool-specific information in a more useful way
 * than the generic ToolUseCard:
 *
 *   bash  → command + exit code + collapsible output
 *   edit  → diff view (old → new)
 *   grep  → file:line: match results
 *   read  → file preview with line numbers
 *   write → created/updated file path
 *   glob  → file list
 *
 * ToolUseCard looks up TOOL_RENDERERS[toolCall.name] — if a renderer
 * exists, it delegates to it; otherwise it falls back to the generic card.
 */

import { ToolCall } from '../../../types';

export interface ToolRendererProps {
  toolCall: ToolCall;
  expanded: boolean;
  onToggle: () => void;
  onPermissionRespond?: (requestId: string, response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny') => void;
}

export type ToolRenderer = React.FC<ToolRendererProps>;

// ─── Registry ─────────────────────────────────────────────────────────────────

const TOOL_RENDERERS: Record<string, ToolRenderer> = {};

export function registerToolRenderer(toolName: string, renderer: ToolRenderer): void {
  TOOL_RENDERERS[toolName.toLowerCase()] = renderer;
}

export function getToolRenderer(toolName: string): ToolRenderer | undefined {
  return TOOL_RENDERERS[toolName.toLowerCase()];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getStatusIcon(status: string): { color: string; icon: React.ReactNode } {
  switch (status) {
    case 'pending':
      return {
        color: 'var(--color-accent)',
        icon: <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />,
      };
    case 'denied':
      return {
        color: '#ef4444',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
      };
    case 'deactivated':
      return {
        color: 'var(--color-text-muted)',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
      };
    case 'failed':
      return {
        color: 'var(--color-error)',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
      };
    default:
      return {
        color: 'var(--color-success)',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" /></svg>,
      };
  }
}

export function getResultString(toolCall: ToolCall): string {
  if (!toolCall.result) return '';
  return typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2);
}

export { TOOL_RENDERERS };
