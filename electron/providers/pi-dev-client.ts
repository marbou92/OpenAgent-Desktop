/**
 * OpenAgent-Desktop - pi.dev Catalog Client
 *
 * A thin wrapper around the static PI_DEV_CATALOG (generated from
 * @mariozechner/pi-ai's models.generated.js) that exposes the same
 * shape of APIs as ModelsDevClient, so the rest of the codebase can
 * treat models.dev and pi.dev uniformly.
 *
 * Differences from models.dev:
 *   - pi.dev is a build-time static catalog (no live HTTP fetch, no ETag).
 *   - All data is bundled in the binary, so refresh() is a no-op.
 *   - The catalog always reports a fixed fetchedAt = build time.
 *
 * Used by:
 *   - main.ts — provider:list-providers merges pi.dev models when the
 *     user picks catalogSource = 'pi.dev' or 'merged'.
 *   - Settings UI — shows pi.dev provider/model counts.
 */

import { PI_DEV_CATALOG, PiDevModel, PiDevProvider, getPiDevProviderIds, getPiDevTotalModelCount } from './pi-dev-catalog';
import { ProviderDefinition, ModelConfig, ModelModalities } from './opencode-types';

// Fixed "fetched at" — the catalog is build-time static, so this is just
// the date this file was loaded. Useful as a "since" timestamp for the UI.
const PI_DEV_STATIC_FETCHED_AT = '2025-01-15T00:00:00.000Z';

export class PiDevClient {
  /** Refresh is a no-op for pi.dev — the catalog is bundled. */
  async refresh(): Promise<void> {
    return;
  }

  /** pi.dev always reports as fresh (it is bundled at build time). */
  isCacheFresh(): boolean {
    return true;
  }

  /** Return the fixed bundle timestamp. */
  getFetchedAt(): string | null {
    return PI_DEV_STATIC_FETCHED_AT;
  }

  /** List all pi.dev provider IDs. */
  getCachedProviderIds(): string[] {
    return getPiDevProviderIds();
  }

  /** Total model count across all pi.dev providers. */
  getTotalModelCount(): number {
    return getPiDevTotalModelCount();
  }

  /** Get all pi.dev models for a single provider. */
  getModels(providerId: string): PiDevModel[] | undefined {
    const provider = PI_DEV_CATALOG[providerId];
    if (!provider) return undefined;
    return Object.values(provider);
  }

  /**
   * Convert a pi.dev model entry into the ModelConfig shape used by the
   * merged provider list. This mirrors the conversion in
   * models-dev-client.ts getMergedProviders() so pi.dev models can be
   * dropped in alongside models.dev models.
   */
  private toModelConfig(model: PiDevModel): ModelConfig {
    const modalities: ModelModalities = {
      input: model.input as Array<'text' | 'image' | 'audio' | 'video' | 'pdf'>,
    };
    return {
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      attachment: model.input.includes('image') || model.input.includes('pdf'),
      tool_call: model.toolCall,
      structured_output: model.structured,
      temperature: true,
      cost: {
        input: model.cost.input,
        output: model.cost.output,
        cache_read: model.cost.cacheRead,
        cache_write: model.cost.cacheWrite,
      },
      limit: {
        context: model.contextWindow || undefined,
        output: model.maxTokens || undefined,
      },
      modalities,
      status: 'active',
      source: 'pi.dev',
    };
  }

  /**
   * Build provider definitions for every pi.dev provider. This is the
   * pi.dev equivalent of ModelsDevClient.getMergedProviders(), minus the
   * build-time .toml / GitHub overlays (pi.dev doesn't have those).
   *
   * Used directly when catalogSource === 'pi.dev' (replaces models.dev
   * entirely) and as a supplementary list when catalogSource === 'merged'.
   */
  getProviders(): ProviderDefinition[] {
    const result: ProviderDefinition[] = [];
    for (const [providerId, providerModels] of Object.entries(PI_DEV_CATALOG)) {
      const models: Record<string, ModelConfig> = {};
      for (const [modelId, piModel] of Object.entries(providerModels as PiDevProvider)) {
        models[modelId] = this.toModelConfig(piModel);
      }
      result.push({
        id: providerId,
        name: this.prettyProviderName(providerId),
        authMethods: ['api'],
        isBuiltin: false,
        icon: 'cloud',
        models,
      });
    }
    return result;
  }

  /**
   * Return a record of pi.dev models keyed by model ID for a single
   * provider. Useful when merging pi.dev models into an existing
   * models.dev provider definition.
   */
  getModelConfigsForProvider(providerId: string): Record<string, ModelConfig> {
    const provider = PI_DEV_CATALOG[providerId];
    if (!provider) return {};
    const out: Record<string, ModelConfig> = {};
    for (const [modelId, piModel] of Object.entries(provider)) {
      out[modelId] = this.toModelConfig(piModel);
    }
    return out;
  }

  /**
   * Return a set of all (providerId, modelId) pairs in pi.dev. Used by
   * ModelsDevClient to detect which models.dev entries are also in pi.dev
   * (so the UI can badge them with "also in pi.dev").
   */
  getEntrySet(): Set<string> {
    const set = new Set<string>();
    for (const [providerId, providerModels] of Object.entries(PI_DEV_CATALOG)) {
      for (const modelId of Object.keys(providerModels)) {
        set.add(`${providerId}/${modelId}`);
      }
    }
    return set;
  }

  /** Convert a providerId slug into a human-readable name. */
  private prettyProviderName(providerId: string): string {
    // Special cases for known pi.dev provider IDs that don't prettify well.
    const special: Record<string, string> = {
      'amazon-bedrock': 'Amazon Bedrock',
      'azure-openai-responses': 'Azure OpenAI',
      'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
      'cloudflare-workers-ai': 'Cloudflare Workers AI',
      'github-copilot': 'GitHub Copilot',
      'google': 'Google',
      'google-vertex': 'Google Vertex AI',
      'huggingface': 'Hugging Face',
      'kimi-coding': 'Kimi Coding',
      'minimax-cn': 'MiniMax (China)',
      'moonshotai': 'Moonshot AI',
      'moonshotai-cn': 'Moonshot AI (China)',
      'openai': 'OpenAI',
      'openai-codex': 'OpenAI Codex',
      'opencode': 'OpenCode',
      'opencode-go': 'OpenCode Go',
      'openrouter': 'OpenRouter',
      'vercel-ai-gateway': 'Vercel AI Gateway',
      'xai': 'xAI',
      'xiaomi': 'Xiaomi',
      'xiaomi-token-plan-ams': 'Xiaomi (AMS)',
      'xiaomi-token-plan-cn': 'Xiaomi (CN)',
      'xiaomi-token-plan-sgp': 'Xiaomi (SGP)',
      'zai': 'Z.AI',
    };
    if (special[providerId]) return special[providerId];
    // Default: capitalize each segment.
    return providerId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }
}

// Singleton
let _client: PiDevClient | null = null;
export function getPiDevClient(): PiDevClient {
  if (!_client) _client = new PiDevClient();
  return _client;
}
