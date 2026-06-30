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

// ─── Phase 2.4.2: Per-Tool Visual Identity ──────────────────────────────────
// Each tool has a unique SHAPE (small 12x12 icon) + COLOR (left border + tint).

export interface ToolVisual {
  shape: React.ReactNode;
  color: string;   // border + accent color
  tint: string;    // very faint background tint
  label: string;   // short label for the collapsed state
}

const SHAPE_SVG = (path: string, fill = 'none') => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

export const TOOL_VISUALS: Record<string, ToolVisual> = {
  bash: {
    // ⬛ Square — terminal block
    shape: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="1" /><polyline points="7 9 10 12 7 15" /><line x1="13" y1="15" x2="17" y2="15" /></svg>,
    color: '#22c55e',  // terminal green
    tint: 'rgba(34,197,94,0.04)',
    label: 'bash',
  },
  edit: {
    // ◀ Left-pointing triangle — diff marker
    shape: SHAPE_SVG('M3 12l6-6v4h12v4H9v4z'),
    color: '#f59e0b',  // amber
    tint: 'rgba(245,158,11,0.04)',
    label: 'edit',
  },
  grep: {
    // 🔍 Magnifier — search
    shape: SHAPE_SVG('M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.35-4.35'),
    color: '#3b82f6',  // blue
    tint: 'rgba(59,130,246,0.04)',
    label: 'grep',
  },
  read: {
    // ▭ Document — file read
    shape: SHAPE_SVG('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8'),
    color: '#6b7280',  // grey
    tint: 'rgba(107,114,128,0.04)',
    label: 'read',
  },
  write: {
    // ✦ Diamond — create/new
    shape: SHAPE_SVG('M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z'),
    color: '#8b5cf6',  // purple
    tint: 'rgba(139,92,246,0.04)',
    label: 'write',
  },
  glob: {
    // ◫ Grid — file tree
    shape: SHAPE_SVG('M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'),
    color: '#14b8a6',  // teal
    tint: 'rgba(20,184,166,0.04)',
    label: 'glob',
  },
  webfetch: {
    // ○ Globe — web fetch
    shape: SHAPE_SVG('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'),
    color: '#06b6d4',  // cyan
    tint: 'rgba(6,182,212,0.04)',
    label: 'webfetch',
  },
  websearch: {
    // ◐ Half-circle magnifier — search the web
    shape: SHAPE_SVG('M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.35-4.35 M11 11v6'),
    color: '#0891b2',  // darker cyan
    tint: 'rgba(8,145,178,0.04)',
    label: 'websearch',
  },
  apply_patch: {
    // △ Triangle — patch marker
    shape: SHAPE_SVG('M12 2L2 20h20L12 2z'),
    color: '#f97316',  // orange
    tint: 'rgba(249,115,22,0.04)',
    label: 'apply_patch',
  },
};

export function getToolVisual(toolName: string): ToolVisual | undefined {
  return TOOL_VISUALS[toolName.toLowerCase()];
}

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
