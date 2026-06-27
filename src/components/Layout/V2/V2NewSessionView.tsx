/**
 * OpenAgent-Desktop — V2 New Session View (Phase 1.4)
 *
 * The Modern-layout new/empty session state. Deep background with the app
 * logo centered at ~25% from the top, and the V2 composer below it (max-w-720px).
 *
 *   ┌────────────────────────────────────────────┐
 *   │                                            │
 *   │                                            │
 *   │            [  LOGO  ]                      │  ← ~25% from top
 *   │                                            │
 *   │   ╭────────────────────────────────────╮   │
 *   │   │ Ask anything, / for commands...    │   │  ← V2Composer (max-w-720)
 *   │   │                                    │   │
 *   │   ├────────────────────────────────────┤   │
 *   │   │ [+]  [Model ▾]              [⬆]   │   │
 *   │   ╰────────────────────────────────────╯   │
 *   │                                            │
 *   └────────────────────────────────────────────┘
 */

import React from 'react';
import V2Composer from './V2Composer';
import { AttachedFile, ProviderInfo, AgentMode, AgentDefinition } from '../../../types';
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
  // Phase 1.8: thinking effort + agent mode
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
      className="relative h-full w-full overflow-hidden flex flex-col items-center"
      style={{ background: 'var(--v2-background-bg-deep)' }}
    >
      {/* Logo — centered horizontally, ~25% from top */}
      <div
        className="absolute inset-x-0 flex justify-center px-6"
        style={{ top: '25.375%' }}
      >
        <div className="w-full max-w-[720px] flex flex-col items-center">
          {/* App logo (uses /logo.svg from public/) */}
          <img
            src="/logo.svg"
            alt="OpenAgent Desktop"
            className="h-12 w-auto mb-8"
            style={{ opacity: 0.9 }}
          />
          {/* App name wordmark */}
          <h1
            className="text-[20px] mb-1"
            style={{
              color: 'var(--v2-text-text-base)',
              fontFamily: 'var(--v2-font-family-text)',
              fontWeight: 'var(--v2-font-weight-medium)',
              letterSpacing: '-0.02em',
            }}
          >
            OpenAgent Desktop
          </h1>
          <p
            className="text-[13px]"
            style={{
              color: 'var(--v2-text-text-muted)',
              fontFamily: 'var(--v2-font-family-text)',
            }}
          >
            How can I help you today?
          </p>
        </div>
      </div>

      {/* Composer — centered, below the logo block, docked near bottom */}
      <div
        className="absolute inset-x-0 flex justify-center px-6"
        style={{ bottom: 'calc(74.625% - 280px)' }}
      >
        <div className="w-full max-w-[720px]">
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
