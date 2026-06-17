/**
 * OpenAgent-Desktop - Provider Connect
 *
 * Button + flow UI for OAuth and Azure AD authentication. When clicked:
 *   - For OAuth: calls oauth:startFlow IPC; main process opens browser.
 *   - For Azure AD: shows a small form for tenantId/clientId, then calls
 *     azure-ad:startFlow IPC.
 *
 * While a flow is in progress, shows a spinner. On success/failure, shows a
 * toast (via the parent).
 */

import React, { useState } from 'react';
import { KeyRound, LogIn, Loader2 } from 'lucide-react';
import { ProviderDefinition, ConfiguredProvider } from './types';

export interface ProviderConnectProps {
  definition: ProviderDefinition;
  configured: ConfiguredProvider | undefined;
  onApiKeySubmit: (apiKey: string) => void;
  onOAuthStart: () => void;
  onAzureAdStart: (tenantId: string, clientId: string) => void;
  onDisconnect: () => void;
  isConnecting: boolean;
}

export const ProviderConnect: React.FC<ProviderConnectProps> = ({
  definition,
  configured,
  onApiKeySubmit,
  onOAuthStart,
  onAzureAdStart,
  onDisconnect,
  isConnecting,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showAzureForm, setShowAzureForm] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');

  const methods = definition.supportedAuthMethods;
  const currentMethod = configured?.auth?.method;
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
            {configured?.auth?.expiresAt && (
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Token expires {new Date(configured.auth.expiresAt).toLocaleString()}
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
      {methods.includes('api_key') && (
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
          {definition.envVarName && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Tip: set <code>${definition.envVarName}</code> env var to skip this field.
            </div>
          )}
        </div>
      )}

      {/* OAuth */}
      {methods.includes('oauth') && (
        <div
          className="p-3 rounded-lg flex items-center justify-between"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Sign in with {definition.name}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Opens your browser for OAuth authorization.
            </div>
          </div>
          <button
            onClick={onOAuthStart}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            <LogIn size={14} /> Connect
          </button>
        </div>
      )}

      {/* Azure AD */}
      {methods.includes('azure_ad') && (
        <div
          className="p-3 rounded-lg space-y-2"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <button
            onClick={() => setShowAzureForm(!showAzureForm)}
            className="text-sm font-medium flex items-center gap-2"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <LogIn size={14} /> Sign in with Azure AD
          </button>
          {showAzureForm && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Tenant ID (or 'common')"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm"
                style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-secondary)' }}
              />
              <input
                type="text"
                placeholder="Client ID (app registration)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm"
                style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-secondary)' }}
              />
              <button
                onClick={() => tenantId.trim() && clientId.trim() && onAzureAdStart(tenantId.trim(), clientId.trim())}
                disabled={!tenantId.trim() || !clientId.trim()}
                className="text-xs px-3 py-1.5 rounded disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Open browser to authenticate
              </button>
            </div>
          )}
        </div>
      )}

      {/* Env var fallback */}
      {methods.includes('env_var') && definition.envVarName && (
        <div
          className="p-3 rounded-lg text-xs"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)', color: 'var(--color-text-muted)' }}
        >
          Alternatively, set <code>${definition.envVarName}</code> in your environment.
          OpenAgent-Desktop will pick it up automatically on next launch.
        </div>
      )}
    </div>
  );
};

export default ProviderConnect;
