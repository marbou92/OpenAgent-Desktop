/**
 * OpenAgent-Desktop - Permission Dialog
 * 
 * Runtime approval dialog when a tool call needs user confirmation.
 * Options: Allow Once, Always Allow, Deny Once, Always Deny.
 * Like OpenCode/Goose permission prompts.
 */

import React from 'react';
import { PermissionRequest } from '../../types';

interface PermissionDialogProps {
  request: PermissionRequest | null;
  onRespond: (response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny') => void;
}

const PermissionDialog: React.FC<PermissionDialogProps> = ({ request, onRespond }) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-4" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div
        className="rounded-xl border shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🛡️</span>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Permission Required</h3>
          </div>

          <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
              Tool: <span style={{ color: 'var(--color-accent)' }}>{request.toolName}</span>
            </div>
            <div className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto" style={{ color: 'var(--color-text-secondary)' }}>
              {JSON.stringify(request.args, null, 2)}
            </div>
            {request.matchedPattern && (
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Matched rule: {request.matchedPattern}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRespond('allow_once')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}
            >
              Allow Once
            </button>
            <button
              onClick={() => onRespond('always_allow')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#22c55e', color: 'white' }}
            >
              Always Allow
            </button>
            <button
              onClick={() => onRespond('deny_once')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}
            >
              Deny
            </button>
            <button
              onClick={() => onRespond('always_deny')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#ef4444', color: 'white' }}
            >
              Always Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
