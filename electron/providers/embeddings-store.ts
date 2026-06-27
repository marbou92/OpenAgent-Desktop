/**
 * OpenAgent-Desktop - Embeddings Store (Phase 4)
 *
 * A simple in-memory vector store for semantic search over session
 * history. Uses cosine similarity for matching.
 *
 * Each entry stores:
 *   - id: unique identifier
 *   - sessionId: which session it belongs to
 *   - text: the original text
 *   - embedding: number[] vector
 *   - metadata: optional extra info (role, timestamp, etc.)
 *
 * The store is per-session — search only returns results from the
 * specified session.
 *
 * This is intentionally simple (in-memory, no persistence). For
 * production use, this would be backed by SQLite-vss or a real vector DB.
 */

export interface EmbeddingEntry {
  id: string;
  sessionId: string;
  text: string;
  embedding: number[];
  metadata?: {
    role?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
}

export interface SearchResult {
  entry: EmbeddingEntry;
  score: number;
}

class EmbeddingsStore {
  private entries: Map<string, EmbeddingEntry> = new Map();
  private bySession: Map<string, Set<string>> = new Map();

  /**
   * Add an embedding to the store.
   */
  add(entry: EmbeddingEntry): void {
    this.entries.set(entry.id, entry);
    if (!this.bySession.has(entry.sessionId)) {
      this.bySession.set(entry.sessionId, new Set());
    }
    this.bySession.get(entry.sessionId)!.add(entry.id);
  }

  /**
   * Add multiple embeddings at once.
   */
  addMany(entries: EmbeddingEntry[]): void {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  /**
   * Search for similar texts within a session.
   * Returns top-K results sorted by cosine similarity (highest first).
   */
  search(sessionId: string, queryEmbedding: number[], topK = 5): SearchResult[] {
    const sessionEntryIds = this.bySession.get(sessionId);
    if (!sessionEntryIds || sessionEntryIds.size === 0) return [];

    const results: SearchResult[] = [];
    for (const id of sessionEntryIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({ entry, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Get all entries for a session (no search, just list).
   */
  getBySession(sessionId: string): EmbeddingEntry[] {
    const sessionEntryIds = this.bySession.get(sessionId);
    if (!sessionEntryIds) return [];
    const result: EmbeddingEntry[] = [];
    for (const id of sessionEntryIds) {
      const entry = this.entries.get(id);
      if (entry) result.push(entry);
    }
    return result;
  }

  /**
   * Clear all entries for a session.
   */
  clearSession(sessionId: string): void {
    const sessionEntryIds = this.bySession.get(sessionId);
    if (!sessionEntryIds) return;
    for (const id of sessionEntryIds) {
      this.entries.delete(id);
    }
    this.bySession.delete(sessionId);
  }

  /**
   * Get the count of embeddings for a session.
   */
  count(sessionId: string): number {
    return this.bySession.get(sessionId)?.size || 0;
  }
}

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = unrelated).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// Singleton
let _store: EmbeddingsStore | null = null;

export function getEmbeddingsStore(): EmbeddingsStore {
  if (!_store) _store = new EmbeddingsStore();
  return _store;
}
