/**
 * OpenAgent-Desktop - Chat Empty State (Phase 2 Redesign)
 *
 * Welcoming, modern empty state shown when a session has no messages yet.
 * Inspired by open-cowork / opencode-desktop: large brand mark, a one-line
 * hint, and a grid of suggested prompts that pre-fill the composer on click.
 *
 * The component is purely presentational — the parent decides what to do
 * when a prompt is clicked (typically: fill the input + focus it, or send
 * immediately).
 */

import React from 'react';

interface ChatEmptyStateProps {
  /** Called when the user clicks a suggested prompt. */
  onPickPrompt: (prompt: string) => void;
  /** Called when the user clicks the "new chat" button. */
  onNewSession?: () => void;
  /** When true, no provider is configured — show a setup hint instead. */
  noProvidersConfigured?: boolean;
}

const SUGGESTED_PROMPTS: { icon: string; title: string; prompt: string }[] = [
  {
    icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    title: 'Explain code',
    prompt: 'Explain what this codebase does and how it is structured.',
  },
  {
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    title: 'Write tests',
    prompt: 'Write unit tests for the most important module in this project.',
  },
  {
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    title: 'Security audit',
    prompt: 'Audit this project for security issues and list any vulnerabilities.',
  },
  {
    icon: 'M3 3v18h18 M7 12h4 M7 8h7 M7 16h10',
    title: 'Refactor',
    prompt: 'Find the most complex function in this project and refactor it for readability.',
  },
];

const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
  onPickPrompt,
  onNewSession,
  noProvidersConfigured = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8">
      {/* Brand mark */}
      <div className="mb-6 animate-fade-in">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent), #6d28d9)',
            boxShadow: '0 8px 24px rgba(139,92,246,0.25)',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>

      <h1
        className="text-xl font-semibold mb-1.5 text-center"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {noProvidersConfigured ? 'Welcome to OpenAgent' : 'How can I help today?'}
      </h1>

      <p
        className="text-sm text-center max-w-sm mb-8"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {noProvidersConfigured
          ? 'Add an API key for any provider in Settings to start chatting with the AI agent.'
          : 'Pick a mode, choose a model, and ask anything. Use / for slash commands.'}
      </p>

      {/* Suggested prompts grid */}
      {!noProvidersConfigured && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p.title}
              onClick={() => onPickPrompt(p.prompt)}
              className="group flex items-start gap-3 p-3 rounded-xl text-left transition-all"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-primary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-secondary)';
                e.currentTarget.style.borderColor = 'var(--color-border-primary)';
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: 'var(--color-accent-soft)' }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={p.icon} />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-xs font-medium mb-0.5"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {p.title}
                </div>
                <div
                  className="text-xs truncate"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {p.prompt}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New session CTA — only when no providers configured (otherwise the
          user is already in a new chat, so showing "New Chat" is redundant). */}
      {noProvidersConfigured && onNewSession && (
        <button
          onClick={onNewSession}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors mt-2"
          style={{ background: 'var(--color-accent)', color: 'white' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      )}
    </div>
  );
};

export default ChatEmptyState;
