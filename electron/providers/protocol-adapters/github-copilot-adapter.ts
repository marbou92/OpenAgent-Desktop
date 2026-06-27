/**
 * OpenAgent-Desktop - GitHub Copilot Adapter
 *
 * GitHub Copilot's API is OpenAI-compatible but requires a two-step auth:
 *   1. Exchange the GitHub OAuth token for a short-lived Copilot token
 *      via GET https://api.github.com/copilot_internal/v2/token
 *   2. Use the Copilot token as the API key for
 *      POST https://api.githubcopilot.com/chat/completions
 *
 * The Copilot token expires ~30 minutes; we cache it and refresh on demand.
 */

import {
  AuthProvider,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
} from '../opencode-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';
import { OpenAIAdapter } from './openai-adapter';

const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_API_BASE = 'https://api.githubcopilot.com';
const _TOKEN_CACHE_TTL_MS = 25 * 60 * 1000;

interface CachedCopilotToken {
  token: string;
  expiresAt: number;
}

let _cachedToken: CachedCopilotToken | null = null;

async function getCopilotToken(githubToken: string): Promise<string> {
  if (_cachedToken && _cachedToken.expiresAt > Date.now()) {
    return _cachedToken.token;
  }
  const response = await fetch(COPILOT_TOKEN_URL, {
    method: 'GET',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/json',
      'Editor-Version': 'vscode/1.85.0',
      'Editor-Plugin-Version': 'copilot/1.0.0',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Copilot token exchange failed: ${response.status}`);
  }
  const data = (await response.json()) as { token: string; expires_at: number };
  _cachedToken = {
    token: data.token,
    expiresAt: (data.expires_at || 0) * 1000,
  };
  return data.token;
}

export class GithubCopilotAdapter implements ProtocolAdapter {
  protocol = 'github-copilot' as const;
  private openaiAdapter = new OpenAIAdapter();

  buildAuth(_auth: AuthProvider, _baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    // Copilot auth is handled in chat()/chatStream() via token exchange.
    return { headers: {}, query: {} };
  }

  private getGithubToken(ctx: AdapterCallContext): string {
    const auth = ctx.auth;
    if (auth.type === 'wellknown') return auth.token;
    if (auth.type === 'api') return auth.key;
    throw new Error('GitHub Copilot requires wellknown or api auth');
  }

  private async resolveCtx(ctx: AdapterCallContext): Promise<AdapterCallContext> {
    const githubToken = this.getGithubToken(ctx);
    const copilotToken = await getCopilotToken(githubToken);
    return {
      ...ctx,
      auth: { type: 'api', key: copilotToken },
      baseUrl: COPILOT_API_BASE,
    };
  }

  async chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse> {
    const resolvedCtx = await this.resolveCtx(ctx);
    return this.openaiAdapter.chat(request, resolvedCtx);
  }

  async *chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const resolvedCtx = await this.resolveCtx(ctx);
    yield* this.openaiAdapter.chatStream(request, resolvedCtx);
  }

  async discoverModels(_ctx: AdapterCallContext): Promise<DiscoveredModel[]> {
    return [
      { id: 'gpt-4o', displayName: 'GPT-4o (Copilot)', supportsStreaming: true, supportsToolUse: true, contextWindow: 128000 },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o mini (Copilot)', supportsStreaming: true, supportsToolUse: true, contextWindow: 128000 },
      { id: 'claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet (Copilot)', supportsStreaming: true, supportsToolUse: true, contextWindow: 200000 },
      { id: 'o3-mini', displayName: 'o3-mini (Copilot)', supportsStreaming: true, supportsToolUse: true, contextWindow: 200000 },
    ];
  }
}
