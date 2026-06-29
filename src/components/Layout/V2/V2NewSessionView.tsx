/**
 * OpenAgent-Desktop — V2 New-Session View (Phase 2.0.3)
 *
 * The first-launch / "New session" landing view for the V2 (Modern) layout.
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ (deep bg)                                              │
 *   │                                                        │
 *   │              [logo at 25.375% from top]                │
 *   │                                                        │
 *   │                OpenAgent-Desktop                       │
 *   │             What can I build for you?                  │
 *   │                                                        │
 *   │      ┌─────────────────────────────────────────┐       │
 *   │      │  V2Composer (max-w 720px)               │       │
 *   │      └─────────────────────────────────────────┘       │
 *   │                                                        │
 *   └────────────────────────────────────────────────────────┘
 *
 * The view is a deep-bg column with the brand mark anchored at 25.375% of
 * the viewport height (matches the opencode-desktop "splash hero" feel).
 * The composer sits in a 720px-wide column below the wordmark.
 *
 * Note: the spec referenced `/logo.svg` but the OpenAgent-Desktop project
 * does not ship a logo asset file — we use the inline layered-stack SVG
 * mark that the rest of the app (Sidebar, splash screen) already uses.
 */

import React from 'react';
import { ProviderInfo, AgentMode, AgentDefinition, AttachedFile } from '../../../types';
import V2Composer from './V2Composer';
import { ThinkingEffort } from '../../Chat/ThinkingEffortSelector';

interface V2NewSessionViewProps {
  onSend: (content: string, files?: AttachedFile[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
  onImagesAttached?: (images: string[]) => void;
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  modelSupportsReasoning?: boolean;
  showThinkingEffort?: boolean;
  activeMode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  showAgentMode?: boolean;
}

const V2NewSessionView: React.FC<V2NewSessionViewProps> = ({
  onSend,
  onStop,
  isStreaming,
  providers,
  selectedProviderId,
  selectedModel,
  onProviderChange,
  onModelChange,
  onImagesAttached,
  thinkingEffort,
  onThinkingEffortChange,
  modelSupportsReasoning,
  showThinkingEffort,
  activeMode,
  onModeChange,
  customAgents,
  showAgentMode,
}) => {
  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{
        background: 'var(--v2-background-bg-deep, var(--v2-background-bg-base))',
        fontFamily: 'var(--v2-font-family-text)',
      }}
    >
      {/* Brand mark — anchored at 25.375% from the top of the viewport. */}
      <div
        className="flex flex-col items-center"
        style={{ paddingTop: '25.375vh' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--v2-radius-xl, 16px)',
            background: 'linear-gradient(135deg, var(--color-accent, var(--v2-blue-600)), #6d28d9)',
            boxShadow: 'var(--v2-elevation-raised)',
            marginBottom: '20px',
          }}
        >
          {/* Layered-stack logo (matches Sidebar + splash screen). */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        <h1
          className="text-center"
          style={{
            color: 'var(--v2-text-text-base)',
            fontSize: '24px',
            fontWeight: 'var(--v2-font-weight-medium)',
            letterSpacing: '-0.01em',
            marginBottom: '6px',
          }}
        >
          OpenAgent-Desktop
        </h1>
        <p
          className="text-center"
          style={{
            color: 'var(--v2-text-text-muted)',
            fontSize: '14px',
            fontWeight: 'var(--v2-font-weight-regular)',
            marginBottom: '40px',
          }}
        >
          What can I build for you?
        </p>

        {/* Composer column — 720px max, full width on small screens. */}
        <div
          className="w-full px-4 mx-auto"
          style={{ maxWidth: '720px', marginBottom: '80px' }}
        >
          <V2Composer
            onSend={onSend}
            onStop={onStop}
            isStreaming={isStreaming}
            providers={providers}
            selectedProviderId={selectedProviderId}
            selectedModel={selectedModel}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            onImagesAttached={onImagesAttached}
            autoFocus
            thinkingEffort={thinkingEffort}
            onThinkingEffortChange={onThinkingEffortChange}
            modelSupportsReasoning={modelSupportsReasoning}
            showThinkingEffort={showThinkingEffort}
            activeMode={activeMode}
            onModeChange={onModeChange}
            customAgents={customAgents}
            showAgentMode={showAgentMode}
          />
        </div>
      </div>
    </div>
  );
};

export default V2NewSessionView;
