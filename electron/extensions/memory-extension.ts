/**
 * OpenAgent-Desktop - Memory Runtime Extension
 * 
 * Injects core memory context into agent sessions.
 * Uses the AgentRuntimeExtension lifecycle hooks.
 */

import { AgentRuntimeExtension, BeforeSessionRunContext, BeforeSessionRunResult, AfterSessionRunContext, SessionDeletedContext } from './runtime-extension';
import { CoreMemoryStore } from '../memory/core-store';
import { ExperienceMemoryStore } from '../memory/experience-store';

export class MemoryRuntimeExtension implements AgentRuntimeExtension {
  name = 'memory';
  description = 'Injects core memory and relevant experience context into agent sessions';

  private coreStore: CoreMemoryStore;
  private experienceStore: ExperienceMemoryStore;

  constructor(coreStore: CoreMemoryStore, experienceStore: ExperienceMemoryStore) {
    this.coreStore = coreStore;
    this.experienceStore = experienceStore;
  }

  async beforeSessionRun(context: BeforeSessionRunContext): Promise<BeforeSessionRunResult> {
    const parts: string[] = [];

    // Inject core memory
    const coreMemory = this.coreStore.getContextString();
    if (coreMemory) {
      parts.push(coreMemory);
    }

    // Search for relevant experiences based on the user's message
    const lastUserMessage = context.messages
      .filter((m) => m.role === 'user')
      .pop()?.content;

    if (lastUserMessage) {
      const experiences = this.experienceStore.search(lastUserMessage, 3);
      if (experiences.length > 0) {
        parts.push('\n[Relevant Past Experience]');
        for (const exp of experiences) {
          const experience = exp.memory as any;
          parts.push(`  - ${experience.summary} (${experience.outcome}, ${new Date(experience.createdAt).toLocaleDateString()})`);
        }
      }
    }

    if (parts.length > 0) {
      return { promptPrefix: parts.join('\n\n') };
    }

    return {};
  }

  async afterSessionRun(context: AfterSessionRunContext): Promise<void> {
    // Save experience from this session
    if (context.status === 'completed' || context.status === 'stopped') {
      const lastUserMessage = ''; // Would be extracted from session messages
      if (lastUserMessage) {
        await this.experienceStore.add({
          sessionId: context.sessionId,
          summary: `Session in ${context.agentMode} mode with ${context.totalSteps} steps - ${context.status}`,
          keyTopics: [],
          toolsUsed: [],
          outcome: context.status === 'completed' ? 'success' : 'partial',
          workingDirectory: context.workingDirectory,
          model: context.model,
        });
      }
    }
  }

  async onSessionDeleted(context: SessionDeletedContext): Promise<void> {
    // Clean up experience memory for deleted session
    const experience = this.experienceStore.getBySession(context.sessionId);
    if (experience) {
      await this.experienceStore.delete(experience.id);
    }
  }
}
