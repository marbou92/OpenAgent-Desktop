/**
 * OpenAgent-Desktop - Provider Connect (opencode-style)
 *
 * Button + flow UI for API key, GitHub Copilot device-flow auth, and
 * Google OAuth (Gemini Free OAuth).
 */

import React, { useState } from 'react';
import { KeyRound, LogIn, Loader2, Github, Chrome } from 'lucide-react';
import { ProviderDefinition, AuthProvider } from './types';

export interface ProviderConnectProps {
  definition: ProviderDefinition;
  configured: AuthProvider | undefined;
  onApiKeySubmit: (apiKey: string) => void;
  onCopilotStart: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
  /** Phase 8.7: Called when the user clicks "Sign in with Google" for OAuth providers. */
  onOAuthStart?: () => void;
}

export const ProviderConnect: React.FC<ProviderConnectProps> = ({
  definition,
  configured,
  onApiKeySubmit,
  onCopilotStart,
  onDisconnect,
  isConnecting,
  onOAuthStart,
}) => {
  const [apiKey, setApiKey] = useState('');

  const methods = definition.authMethods || ['api'];
  const currentMethod = configured?.type;
  const isAuthed = currentMethod !== undefined;

  // Already authenticated — show status + disconnect.
  if (isAuthed && !isConnecting) {
    return (
      <div
        className="p-3 rounded-lg flex items-center justify-between"
        style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)' }}
      >
        <div className="flex items-center gap-2">
          <KeyRound size={16} style={{ color: '#22c55e' }} />
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Connected via {currentMethod}
            </div>
            {configured?.expires && (
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Token expires {new Date(configured.expires).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onDisconnect}
          className="text-xs px-2 py-1 rounded"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.30)' }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div
        className="p-3 rounded-lg flex items-center gap-2"
        style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }}
      >
        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Waiting for browser authorization...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* API key */}
      {methods.includes('api') && (
        <div
          className="p-3 rounded-lg space-y-2"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            API Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Paste your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded text-sm"
              style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-secondary)' }}
            />
            <button
              onClick={() => apiKey.trim() && onApiKeySubmit(apiKey.trim())}
              disabled={!apiKey.trim()}
              className="text-xs px-3 py-1.5 rounded disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Save
            </button>
          </div>
          {definition.env && definition.env.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Tip: set <code>${definition.env[0]}</code> env var to skip this field.
            </div>
          )}
        </div>
      )}

      {/* GitHub Copilot device flow */}
      {methods.includes('wellknown') && (
        <div
          className="p-3 rounded-lg flex items-center justify-between"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <div>
            <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <Github size={14} /> Sign in with GitHub
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Opens your browser for device-flow authorization.
            </div>
          </div>
          <button
            onClick={onCopilotStart}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            <LogIn size={14} /> Connect
          </button>
        </div>
      )}

      {/* Phase 8.7: Google OAuth (Gemini Free OAuth) */}
      {methods.includes('oauth') && (
        <div
          className="p-3 rounded-lg flex items-center justify-between"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <div>
            <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <Chrome size={14} /> Sign in with Google
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Opens your browser for Google OAuth. Free access to Gemini models via the Code Assist API — no API key needed.
            </div>
          </div>
          <button
            onClick={() => onOAuthStart?.()}
            disabled={!onOAuthStart}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            <LogIn size={14} /> Connect
          </button>
        </div>
      )}
    </div>
  );
};

export default ProviderConnect;
