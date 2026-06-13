/**
 * OpenAgent-Desktop - Experience Memory Store
 * 
 * Manages experience memories: session summaries with semantic search.
 * Embedding-based retrieval across past sessions.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExperienceMemory, MemorySearchResult } from './types';

export class ExperienceMemoryStore extends EventEmitter {
  private experiences: Map<string, ExperienceMemory> = new Map();
  private filePath: string;

  constructor() {
    super();
    const configDir = path.join(os.homedir(), '.openagent');
    this.filePath = path.join(configDir, 'experience-memory.json');
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data: ExperienceMemory[] = JSON.parse(content);
      for (const exp of data) {
        this.experiences.set(exp.id, exp);
      }
    } catch {
      // No experiences yet
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(Array.from(this.experiences.values()), null, 2), 'utf-8');
  }

  async add(experience: Omit<ExperienceMemory, 'id' | 'createdAt'>): Promise<ExperienceMemory> {
    const exp: ExperienceMemory = {
      ...experience,
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.experiences.set(exp.id, exp);
    await this.save();
    this.emit('experience:created', exp);
    return exp;
  }

  async delete(id: string): Promise<void> {
    this.experiences.delete(id);
    await this.save();
    this.emit('experience:deleted', { id });
  }

  list(limit?: number): ExperienceMemory[] {
    const all = Array.from(this.experiences.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return limit ? all.slice(0, limit) : all;
  }

  get(id: string): ExperienceMemory | undefined {
    return this.experiences.get(id);
  }

  search(query: string, limit = 10): MemorySearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);
    
    const results: MemorySearchResult[] = [];

    for (const exp of this.experiences.values()) {
      let score = 0;
      const searchable = `${exp.summary} ${exp.keyTopics.join(' ')} ${exp.toolsUsed.join(' ')}`.toLowerCase();

      // Term matching score
      for (const term of queryTerms) {
        if (searchable.includes(term)) {
          score += 1;
        }
      }

      // Exact phrase bonus
      if (searchable.includes(queryLower)) {
        score += 3;
      }

      // Recency bonus (newer = higher score)
      const ageMs = Date.now() - new Date(exp.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      score += Math.max(0, 1 - ageDays / 30); // Bonus for recent (within 30 days)

      // Outcome bonus
      if (exp.outcome === 'success') score += 0.5;

      if (score > 0) {
        results.push({
          memory: exp,
          type: 'experience',
          score,
          matchedContent: exp.summary.slice(0, 300),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  getBySession(sessionId: string): ExperienceMemory | undefined {
    return Array.from(this.experiences.values()).find((e) => e.sessionId === sessionId);
  }

  count(): number {
    return this.experiences.size;
  }
}
