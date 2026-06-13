/**
 * OpenAgent-Desktop - Memory System Types
 * 
 * Two-layer memory system inspired by OpenCowork:
 * - Core Memory: Identity, preferences, skills, interests (always loaded)
 * - Experience Memory: Session summaries with semantic search
 */

export interface CoreMemory {
  id: string;
  category: 'identity' | 'preferences' | 'skills' | 'interests' | 'notes';
  key: string;
  value: string;
  updatedAt: string;
  createdAt: string;
}

export interface ExperienceMemory {
  id: string;
  sessionId: string;
  summary: string;
  keyTopics: string[];
  toolsUsed: string[];
  outcome: 'success' | 'partial' | 'failure';
  workingDirectory?: string;
  model?: string;
  embedding?: number[];
  createdAt: string;
}

export interface MemorySearchResult {
  memory: CoreMemory | ExperienceMemory;
  type: 'core' | 'experience';
  score: number;
  matchedContent: string;
}

export interface MemoryContext {
  coreMemories: CoreMemory[];
  relevantExperiences: ExperienceMemory[];
  totalCoreMemories: number;
  totalExperiences: number;
}
