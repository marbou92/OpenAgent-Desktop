/**
 * OpenAgent-Desktop - Permission Dialog (Phase 11.4)
 *
 * Clean, minimal permission prompt that matches the app's style.
 * Shows the tool name + a preview of the command/args.
 * Buttons: Allow Once, Always Allow, Deny.
 *
 * "Always Allow" persists a rule so future calls to the same tool
 * are auto-approved. "Always Deny" blocks future calls.
 */

import React from 'react';
import { PermissionRequest } from '../../types';

interface PermissionDialogProps {
  request: PermissionRequest | null;
  onRespond: (response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny') => void;
}

const PermissionDialog: React.FC<PermissionDialogProps> = ({ request, onRespond }) => {
  if (!request) return null;

  // Build a human-readable preview of what the tool wants to do.
  const args = request.args || {};
  let preview = '';
  let toolLabel = request.toolName;

  if (request.toolName === 'bash' && args.command) {
    toolLabel = 'Run command';
    preview = String(args.command);
  } else if ((request.toolName === 'edit' || request.toolName === 'write') && args.path) {
    toolLabel = `${request.toolName === 'edit' ? 'Edit' : 'Write'} file`;
    preview = String(args.path);
  } else if (request.toolName === 'read' && args.path) {
    toolLabel = 'Read file';
    preview = String(args.path);
  } else if (request.toolName === 'glob' && args.pattern) {
    toolLabel = 'Search files';
    preview = String(args.pattern);
  } else if (request.toolName === 'grep' && args.pattern) {
    toolLabel = 'Search content';
    preview = String(args.pattern);
  } else {
    preview = JSON.stringify(args, null, 2);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={() => onRespond('deny_once')}
    >
      <div
        className="rounded-2xl border shadow-2xl w-full max-w-md overflow-hidden animate-fade-in"
        style={{ background: 'var(--color-bg-elevated, var(--color-bg-secondary))', borderColor: 'var(--color-border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-accent-soft)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Permission Required
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {toolLabel}
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="px-4 py-3">
          <div
            className="p-2.5 rounded-lg font-mono text-xs break-all max-h-28 overflow-auto"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
          >
            {preview}
          </div>
        </div>

        {/* Buttons */}
        <div className="px-4 pb-4 flex items-center gap-2">
          {/* Allow Once */}
          <button
            onClick={() => onRespond('allow_once')}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'rgba(34,197,94,0.1)',
              color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.2)',
            }}
          >
            Allow Once
          </button>
          {/* Always Allow */}
          <button
            onClick={() => onRespond('always_allow')}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: '#22c55e',
              color: 'white',
            }}
          >
            Always Allow
          </button>
          {/* Deny */}
          <button
            onClick={() => onRespond('deny_once')}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            Deny
          </button>
        </div>

        {/* Always Deny — smaller, secondary */}
        <div className="px-4 pb-3 flex justify-center">
          <button
            onClick={() => onRespond('always_deny')}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
          >
            Always deny this tool
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
