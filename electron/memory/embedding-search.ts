/**
 * OpenAgent-Desktop - Embedding-Based Semantic Search
 *
 * Provides semantic search over experience memories using embeddings.
 * Falls back to TF-IDF when no embedding model is available.
 * Like OpenCowork's embedding-based memory retrieval.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExperienceMemory, MemorySearchResult } from './types';

// ─── Embedding Provider Interface ───────────────────────────────────────────

export interface EmbeddingProvider {
  /** Generate an embedding vector for the given text */
  generateEmbedding(text: string): Promise<number[]>;
}

// ─── TF-IDF Search (Fallback) ──────────────────────────────────────────────

interface TFIDFDocument {
  id: string;
  text: string;
  tokens: string[];
  tf: Map<string, number>; // Term frequency
}

export class TFIDFSearch {
  private documents: Map<string, TFIDFDocument> = new Map();
  private idf: Map<string, number> = new Map(); // Inverse document frequency
  private vocabulary: Set<string> = new Set();

  /** Tokenize text into terms */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1); // Skip single-char tokens
  }

  /** Index documents for search */
  index(documents: { id: string; text: string }[]): void {
    // Clear existing index
    this.documents.clear();
    this.idf.clear();
    this.vocabulary.clear();

    // Process each document
    for (const doc of documents) {
      const tokens = this.tokenize(doc.text);
      const tf = new Map<string, number>();

      // Compute term frequency
      for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
        this.vocabulary.add(token);
      }

      // Normalize TF
      const maxTf = Math.max(...Array.from(tf.values()), 1);
      const normalizedTf = new Map<string, number>();
      for (const [term, count] of tf) {
        normalizedTf.set(term, count / maxTf);
      }

      this.documents.set(doc.id, {
        id: doc.id,
        text: doc.text,
        tokens,
        tf: normalizedTf,
      });
    }

    // Compute IDF for each term
    const docCount = this.documents.size;
    for (const term of this.vocabulary) {
      let docsWithTerm = 0;
      for (const doc of this.documents.values()) {
        if (doc.tf.has(term)) {
          docsWithTerm++;
        }
      }
      // IDF with smoothing to avoid division by zero
      this.idf.set(term, Math.log((docCount + 1) / (docsWithTerm + 1)) + 1);
    }
  }

  /** Add a single document to the index */
  addDocument(doc: { id: string; text: string }): void {
    const tokens = this.tokenize(doc.text);
    const tf = new Map<string, number>();

    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
      this.vocabulary.add(token);
    }

    const maxTf = Math.max(...Array.from(tf.values()), 1);
    const normalizedTf = new Map<string, number>();
    for (const [term, count] of tf) {
      normalizedTf.set(term, count / maxTf);
    }

    this.documents.set(doc.id, {
      id: doc.id,
      text: doc.text,
      tokens,
      tf: normalizedTf,
    });

    // Recompute IDF (simplified: just update for terms in this doc)
    const docCount = this.documents.size;
    for (const term of tf.keys()) {
      let docsWithTerm = 0;
      for (const d of this.documents.values()) {
        if (d.tf.has(term)) {
          docsWithTerm++;
        }
      }
      this.idf.set(term, Math.log((docCount + 1) / (docsWithTerm + 1)) + 1);
    }
  }

  /** Remove a document from the index */
  removeDocument(id: string): void {
    this.documents.delete(id);
    // Note: IDF values become stale; full reindex would be ideal
    // but for performance we accept minor inaccuracy
  }

  /** Search using TF-IDF cosine similarity */
  search(query: string, limit: number = 10): { id: string; score: number }[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Compute query TF-IDF vector
    const queryTf = new Map<string, number>();
    for (const token of queryTokens) {
      queryTf.set(token, (queryTf.get(token) || 0) + 1);
    }

    const maxQueryTf = Math.max(...Array.from(queryTf.values()), 1);
    const queryVector = new Map<string, number>();
    for (const [term, count] of queryTf) {
      const idfVal = this.idf.get(term) || 1;
      queryVector.set(term, (count / maxQueryTf) * idfVal);
    }

    // Compute cosine similarity with each document
    const results: { id: string; score: number }[] = [];

    for (const doc of this.documents.values()) {
      const score = this.cosineSimilarity(queryVector, doc.tf);
      if (score > 0) {
        results.push({ id: doc.id, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Compute cosine similarity between two sparse vectors */
  private cosineSimilarity(
    vecA: Map<string, number>,
    vecB: Map<string, number>
  ): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Compute dot product for shared terms
    for (const [term, valA] of vecA) {
      const valB = vecB.get(term);
      if (valB !== undefined) {
        dotProduct += valA * valB;
      }
      normA += valA * valA;
    }

    // Compute norm of vecB
    for (const val of vecB.values()) {
      normB += val * val;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** Get number of indexed documents */
  get size(): number {
    return this.documents.size;
  }
}

// ─── Embedding Cache ────────────────────────────────────────────────────────

interface EmbeddingCache {
  [text: string]: number[];
}

// ─── Semantic Search Engine ─────────────────────────────────────────────────

export class SemanticSearchEngine extends EventEmitter {
  private embeddingProvider: EmbeddingProvider | null;
  private tfidfSearch: TFIDFSearch;
  private memoryIndex: Map<string, ExperienceMemory> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();
  private cacheFilePath: string;
  private lastUpdated: string | null = null;
  private useEmbeddings: boolean;

  constructor(embeddingProvider?: EmbeddingProvider) {
    super();
    this.embeddingProvider = embeddingProvider || null;
    this.tfidfSearch = new TFIDFSearch();
    this.useEmbeddings = !!embeddingProvider;

    const configDir = path.join(os.homedir(), '.openagent');
    this.cacheFilePath = path.join(configDir, 'embeddings-cache.json');
  }

  // ─── Indexing ───────────────────────────────────────────────────────────

  /** Index all experience memories */
  async indexMemories(experiences: ExperienceMemory[]): Promise<void> {
    this.memoryIndex.clear();

    for (const exp of experiences) {
      this.memoryIndex.set(exp.id, exp);
    }

    // Build TF-IDF index (always available as fallback)
    const documents = experiences.map((exp) => ({
      id: exp.id,
      text: `${exp.summary} ${exp.keyTopics.join(' ')} ${exp.toolsUsed.join(' ')}`,
    }));
    this.tfidfSearch.index(documents);

    // If we have an embedding provider, generate embeddings
    if (this.useEmbeddings && this.embeddingProvider) {
      await this.loadCache();
      for (const exp of experiences) {
        if (!this.embeddingCache.has(this.getCacheKey(exp.id))) {
          const text = `${exp.summary} ${exp.keyTopics.join(' ')}`;
          try {
            const embedding = await this.embeddingProvider.generateEmbedding(text);
            this.embeddingCache.set(this.getCacheKey(exp.id), embedding);
            this.emit('embedding:generated', { id: exp.id });
          } catch {
            // If embedding generation fails for one, continue with others
            this.emit('embedding:error', { id: exp.id });
          }
        }
      }
      await this.saveCache();
    }

    this.lastUpdated = new Date().toISOString();
    this.emit('index:updated', { totalDocuments: experiences.length });
  }

  /** Add a single memory to the index */
  async addMemory(experience: ExperienceMemory): Promise<void> {
    this.memoryIndex.set(experience.id, experience);

    // Add to TF-IDF index
    this.tfidfSearch.addDocument({
      id: experience.id,
      text: `${experience.summary} ${experience.keyTopics.join(' ')} ${experience.toolsUsed.join(' ')}`,
    });

    // Generate embedding if provider available
    if (this.useEmbeddings && this.embeddingProvider) {
      const cacheKey = this.getCacheKey(experience.id);
      if (!this.embeddingCache.has(cacheKey)) {
        try {
          const text = `${experience.summary} ${experience.keyTopics.join(' ')}`;
          const embedding = await this.embeddingProvider.generateEmbedding(text);
          this.embeddingCache.set(cacheKey, embedding);
          await this.saveCache();
        } catch {
          // Silently fail; TF-IDF still works
        }
      }
    }

    this.lastUpdated = new Date().toISOString();
    this.emit('memory:added', { id: experience.id });
  }

  /** Remove a memory from the index */
  removeMemory(id: string): void {
    this.memoryIndex.delete(id);
    this.tfidfSearch.removeDocument(id);
    this.embeddingCache.delete(this.getCacheKey(id));
    this.lastUpdated = new Date().toISOString();
    this.emit('memory:removed', { id });
  }

  // ─── Search ─────────────────────────────────────────────────────────────

  /** Semantic search over indexed memories */
  async search(query: string, limit: number = 10): Promise<MemorySearchResult[]> {
    if (this.memoryIndex.size === 0) return [];

    let results: { id: string; score: number }[];

    if (this.useEmbeddings && this.embeddingProvider) {
      results = await this.embeddingSearch(query, limit);
    } else {
      results = this.tfidfSearch.search(query, limit);
    }

    // Apply relevance scoring adjustments: semantic similarity + recency + outcome weighting
    return this.applyRelevanceBoosts(results, query, limit);
  }

  /** Get index statistics */
  getIndexStats(): { totalDocuments: number; indexSize: number; lastUpdated: string | null } {
    return {
      totalDocuments: this.memoryIndex.size,
      indexSize: this.memoryIndex.size,
      lastUpdated: this.lastUpdated,
    };
  }

  // ─── Private: Embedding Search ──────────────────────────────────────────

  private async embeddingSearch(
    query: string,
    limit: number
  ): Promise<{ id: string; score: number }[]> {
    if (!this.embeddingProvider) return this.tfidfSearch.search(query, limit);

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
    } catch {
      // Fall back to TF-IDF if embedding generation fails
      return this.tfidfSearch.search(query, limit);
    }

    // Compute cosine similarity with all cached embeddings
    const results: { id: string; score: number }[] = [];

    for (const [cacheKey, embedding] of this.embeddingCache) {
      const memoryId = this.getMemoryIdFromCacheKey(cacheKey);
      if (!this.memoryIndex.has(memoryId)) continue;

      const similarity = this.cosineSimilarityVectors(queryEmbedding, embedding);
      if (similarity > 0) {
        results.push({ id: memoryId, score: similarity });
      }
    }

    // If we didn't find enough with embeddings, supplement with TF-IDF
    if (results.length < limit) {
      const tfidfResults = this.tfidfSearch.search(query, limit);
      const existingIds = new Set(results.map((r) => r.id));

      for (const r of tfidfResults) {
        if (!existingIds.has(r.id)) {
          results.push({ id: r.id, score: r.score * 0.7 }); // Slight penalty for TF-IDF results
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Apply recency, outcome, and category relevance boosts */
  private applyRelevanceBoosts(
    results: { id: string; score: number }[],
    _query: string,
    limit: number
  ): MemorySearchResult[] {
    const boosted: MemorySearchResult[] = [];

    for (const result of results) {
      const memory = this.memoryIndex.get(result.id);
      if (!memory) continue;

      let score = result.score;

      // Recency bonus: newer experiences are more relevant
      const ageMs = Date.now() - new Date(memory.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyBonus = Math.max(0, 1 - ageDays / 60); // Bonus fades over 60 days
      score += recencyBonus * 0.15;

      // Outcome weighting: successful experiences are more useful
      if (memory.outcome === 'success') {
        score += 0.1;
      } else if (memory.outcome === 'failure') {
        score += 0.05; // Failures still valuable for learning
      }

      // Category-aware: prefer experiences with more key topics (richer context)
      const topicBonus = Math.min(memory.keyTopics.length * 0.02, 0.1);
      score += topicBonus;

      boosted.push({
        memory,
        type: 'experience',
        score,
        matchedContent: memory.summary.slice(0, 300),
      });
    }

    return boosted.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ─── Private: Vector Math ───────────────────────────────────────────────

  private cosineSimilarityVectors(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ─── Private: Cache Management ──────────────────────────────────────────

  private getCacheKey(memoryId: string): string {
    return `mem_${memoryId}`;
  }

  private getMemoryIdFromCacheKey(cacheKey: string): string {
    return cacheKey.replace(/^mem_/, '');
  }

  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(this.cacheFilePath, 'utf-8');
      const data: EmbeddingCache = JSON.parse(content);
      for (const [key, value] of Object.entries(data)) {
        this.embeddingCache.set(key, value);
      }
    } catch {
      // No cache file yet
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const dir = path.dirname(this.cacheFilePath);
      await fs.mkdir(dir, { recursive: true });

      const data: EmbeddingCache = {};
      for (const [key, value] of this.embeddingCache) {
        data[key] = value;
      }
      await fs.writeFile(this.cacheFilePath, JSON.stringify(data), 'utf-8');
    } catch {
      // Silently fail; cache is optional
    }
  }
}
