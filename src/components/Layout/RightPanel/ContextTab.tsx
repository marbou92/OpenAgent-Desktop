/**
 * OpenAgent-Desktop - Context Tab (Phase 3.1)
 *
 * Shows the context the agent is working with for the current session:
 *
 *   ┌─────────────────────────────┐
 *   │ Session                     │
 *   │   Name: My Chat             │
 *   │   Created: 14:32            │
 *   │   Messages: 12              │
 *   │                             │
 *   │ Provider & Model            │
 *   │   OpenCode Zen              │
 *   │   deepseek-v4-flash-free    │
 *   │                             │
 *   │ Working Directory           │
 *   │   /home/user/project        │
 *   │                             │
 *   │ Extensions (3 active)       │
 *   │   ▸ code-mode               │
 *   │   ▸ developer               │
 *   │   ▸ todo                    │
 *   └─────────────────────────────┘
 *
 * This tab helps the user understand WHAT the agent knows about the
 * current session — useful for debugging context issues.
 */

import React from 'react';
import { SessionData, ProviderInfo } from '../../../types';

interface ContextTabProps {
  session: SessionData | null;
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
}

const ContextTab: React.FC<ContextTabProps> = ({
  session,
  providers,
  selectedProviderId,
  selectedModel,
}) => {
  const provider = providers.find((p) => p.id === selectedProviderId);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="overflow-y-auto h-full">
      {/* Session info */}
      <Section title="Session">
        {session ? (
          <>
            <InfoRow label="Name" value={session.name || 'Untitled'} />
            <InfoRow label="Created" value={formatDate(session.createdAt)} />
            <InfoRow label="Updated" value={formatDate(session.updatedAt)} />
            <InfoRow label="Messages" value={String(session.messages?.length || 0)} />
            {session.metadata?.workingDirectory && (
              <InfoRow label="Working dir" value={String(session.metadata.workingDirectory)} mono />
            )}
          </>
        ) : (
          <EmptyHint text="No session active" />
        )}
      </Section>

      {/* Provider & Model */}
      <Section title="Provider & Model">
        {selectedProviderId ? (
          <>
            <InfoRow
              label="Provider"
              value={provider?.name || selectedProviderId}
            />
            <InfoRow
              label="Model"
              value={selectedModel || '—'}
              mono
            />
            {provider?.configured ? (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]"
                style={{
                  background: 'rgba(34,197,94,0.1)',
                  color: 'var(--color-success)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
                Connected
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  color: 'var(--color-error)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-error)' }} />
                Not configured
              </div>
            )}
          </>
        ) : (
          <EmptyHint text="No provider selected" />
        )}
      </Section>

      {/* Phase 4: Token Usage & Cost */}
      {session && session.messages && session.messages.length > 0 && (() => {
        const messagesWithUsage = (session.messages as any[]).filter(m => m.usage);
        if (messagesWithUsage.length === 0) return null;
        const totalPrompt = messagesWithUsage.reduce((sum, m) => sum + (m.usage?.promptTokens || 0), 0);
        const totalCompletion = messagesWithUsage.reduce((sum, m) => sum + (m.usage?.completionTokens || 0), 0);
        const totalTokens = totalPrompt + totalCompletion;
        return (
          <Section title="Token Usage & Cost">
            <InfoRow label="Prompt tokens" value={totalPrompt.toLocaleString()} />
            <InfoRow label="Completion tokens" value={totalCompletion.toLocaleString()} />
            <InfoRow label="Total tokens" value={totalTokens.toLocaleString()} />
            <InfoRow label="Exchanges" value={String(messagesWithUsage.length)} />
          </Section>
        );
      })()}

      {/* Extensions */}
      {session && session.extensions && session.extensions.length > 0 && (
        <Section title={`Extensions (${session.extensions.length})`}>
          <div className="space-y-0.5">
            {session.extensions.map((ext: string) => (
              <div
                key={ext}
                className="flex items-center gap-2 px-2 py-1 rounded text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="truncate font-mono">{ext}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recipes */}
      {session && session.recipes && session.recipes.length > 0 && (
        <Section title={`Recipes (${session.recipes.length})`}>
          <div className="space-y-0.5">
            {session.recipes.map((recipe: string) => (
              <div
                key={recipe}
                className="flex items-center gap-2 px-2 py-1 rounded text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span className="truncate">{recipe}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* No session hint */}
      {!session && (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7h18v14H3z" />
            <path d="M3 7l3-4h12l3 4" />
            <path d="M9 12h6" />
          </svg>
          <p className="text-sm mt-3" style={{ color: 'var(--color-text-muted)' }}>
            No active session
          </p>
          <p className="text-xs mt-1 text-center" style={{ color: 'var(--color-text-muted)' }}>
            Start a new chat to see context info here
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Helper components ────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
    <h3
      className="text-[10px] font-semibold uppercase tracking-wider mb-2"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {title}
    </h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-2">
    <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
      {label}
    </span>
    <span
      className={`text-[11px] text-right break-all ${mono ? 'font-mono' : ''}`}
      style={{ color: 'var(--color-text-primary)' }}
    >
      {value}
    </span>
  </div>
);

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>
    {text}
  </p>
);

export default ContextTab;
