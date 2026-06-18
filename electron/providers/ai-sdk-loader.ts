/**
 * OpenAgent-Desktop - AI SDK Loader
 *
 * Dynamically imports the Vercel AI SDK packages at runtime. Uses dynamic
 * import() because the AI SDK packages are ESM-only and our Electron main
 * process compiles to CommonJS. Dynamic import() works in Node 16+ (Electron 22+).
 *
 * Windows 7 / Electron 22 compatibility:
 *   The AI SDK internally uses `fetch`, `Headers`, `Request`, `Response`,
 *   and `ReadableStream` — globals that don't exist in Node 16. We polyfill
 *   them using `undici` (pure JS, CommonJS-compatible, works on Node 16)
 *   before loading the AI SDK.
 *
 * If the import fails (e.g. package not installed or ESM not supported),
 * falls back gracefully — the provider client will use the hand-rolled
 * protocol adapters instead.
 *
 * Ref: https://ai-sdk.dev/docs/foundations/providers-and-models
 */

import { AuthProvider, ProviderDefinition } from './opencode-types';

// Cached SDK modules (loaded once on first use).
let _aiSdk: any = null;
let _providerFactories: Map<string, any> = new Map();
let _loadAttempted = false;
let _loadSucceeded = false;

/**
 * Polyfill global `fetch`, `Headers`, `Request`, `Response`, and
 * `ReadableStream` using `undici` if they don't exist.
 *
 * This is required for Windows 7 / Electron 22 (Node 16) where these
 * globals are not available. The Vercel AI SDK depends on them internally.
 *
 * `undici` is pure JavaScript (no native modules) and works on Node 16+.
 */
function polyfillFetchGlobals(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const undici = require('undici');

    if (typeof globalThis.fetch !== 'function') {
      (globalThis as any).fetch = undici.fetch;
    }
    if (typeof globalThis.Headers !== 'function') {
      (globalThis as any).Headers = undici.Headers;
    }
    if (typeof globalThis.Request !== 'function') {
      (globalThis as any).Request = undici.Request;
    }
    if (typeof globalThis.Response !== 'function') {
      (globalThis as any).Response = undici.Response;
    }
    if (typeof globalThis.ReadableStream !== 'function') {
      (globalThis as any).ReadableStream = undici.ReadableStream;
    }
    if (typeof globalThis.FormData !== 'function' && undici.FormData) {
      (globalThis as any).FormData = undici.FormData;
    }
    if (typeof globalThis.Blob !== 'function' && undici.Blob) {
      (globalThis as any).Blob = undici.Blob;
    }
    if (typeof (globalThis as any).File !== 'function' && undici.File) {
      (globalThis as any).File = undici.File;
    }

    console.info('[AiSdk] Polyfilled fetch globals via undici');
  } catch (err) {
    // undici not installed — on Node 18+ (Electron 28+) these globals
    // exist natively, so this is only a problem on Node 16 / Win7.
    if (typeof globalThis.fetch !== 'function') {
      console.warn('[AiSdk] undici not available and globalThis.fetch missing — AI SDK will not work on this platform');
    } else {
      console.info('[AiSdk] Global fetch already available — no polyfill needed');
    }
  }
}

/**
 * Attempt to load the AI SDK packages. Returns true if successful.
 * Safe to call multiple times — only loads once.
 */
export async function loadAiSdk(): Promise<boolean> {
  if (_loadAttempted) return _loadSucceeded;
  _loadAttempted = true;

  try {
    // Step 1: Polyfill fetch globals for Node 16 / Electron 22 (Win7).
    polyfillFetchGlobals();

    // Step 2: Use Function() to prevent TypeScript from converting dynamic
    // import() to require() in CommonJS mode. This preserves the native
    // import() call which works in Node 16+ for ESM modules.
    const dynamicImport = new Function('specifier', 'return import(specifier)');

    // Load the core `ai` package.
    _aiSdk = await dynamicImport('ai');

    // Load provider packages lazily — only load what's needed.
    // We cache the factory functions for each provider.
    const providerImports: Record<string, string> = {
      'openai': '@ai-sdk/openai',
      'anthropic': '@ai-sdk/anthropic',
      'google': '@ai-sdk/google',
      'google-vertex': '@ai-sdk/google-vertex',
      'amazon-bedrock': '@ai-sdk/amazon-bedrock',
      'azure': '@ai-sdk/azure',
      'mistral': '@ai-sdk/mistral',
      'groq': '@ai-sdk/groq',
      'cohere': '@ai-sdk/cohere',
      'xai': '@ai-sdk/xai',
      'deepinfra': '@ai-sdk/deepinfra',
      'togetherai': '@ai-sdk/togetherai',
      'perplexity': '@ai-sdk/perplexity',
      'openrouter': '@ai-sdk/openai-compatible', // OpenRouter is OpenAI-compatible
      'fireworks-ai': '@ai-sdk/openai-compatible',
      'deepseek': '@ai-sdk/openai-compatible',
      'nvidia': '@ai-sdk/openai-compatible',
    };

    for (const [providerId, packageName] of Object.entries(providerImports)) {
      try {
        const mod = await dynamicImport(packageName);
        _providerFactories.set(providerId, mod);
      } catch {
        // Provider package not installed — skip. Will fall back to adapters.
      }
    }

    // Also load the openai-compatible package for custom providers.
    try {
      const compatMod = await dynamicImport('@ai-sdk/openai-compatible');
      _providerFactories.set('__openai-compatible__', compatMod);
    } catch {
      // ignore
    }

    _loadSucceeded = true;
    console.info('[AiSdk] Loaded successfully —', _providerFactories.size, 'provider packages available');
    return true;
  } catch (err) {
    console.warn('[AiSdk] Failed to load AI SDK — falling back to hand-rolled adapters:', err);
    _loadSucceeded = false;
    return false;
  }
}

/** Check if the AI SDK is loaded and available. */
export function isAiSdkAvailable(): boolean {
  return _loadSucceeded && _aiSdk !== null;
}

/**
 * Create an AI SDK model instance for a provider + model ID.
 * Returns the model object that can be passed to streamText() / generateText().
 *
 * Returns null if the AI SDK isn't loaded or the provider isn't supported.
 */
export function createSdkModel(
  providerId: string,
  modelId: string,
  auth: AuthProvider,
  options?: { baseURL?: string }
): any | null {
  if (!_loadSucceeded || !_aiSdk) return null;

  // Find the provider factory module.
  let factoryMod = _providerFactories.get(providerId);
  if (!factoryMod) {
    // Fall back to openai-compatible for unknown providers.
    factoryMod = _providerFactories.get('__openai-compatible__');
    if (!factoryMod) return null;
  }

  // Determine the API key / token from the auth entry.
  const apiKey = auth.type === 'api' ? auth.key :
                 auth.type === 'oauth' ? auth.access :
                 auth.type === 'wellknown' ? auth.token : '';

  if (!apiKey) return null;

  try {
    // Each provider package exports a create* function.
    // e.g. @ai-sdk/openai exports createOpenAI
    // We find the create function by convention.
    const factoryName = `create${providerId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
    let createFn = factoryMod[factoryName] || factoryMod.default;

    // For openai-compatible, the factory is createOpenAICompatible.
    if (providerId !== 'openai' && providerId !== 'anthropic' && providerId !== 'google' &&
        providerId !== 'google-vertex' && providerId !== 'amazon-bedrock' && providerId !== 'azure' &&
        providerId !== 'mistral' && providerId !== 'groq' && providerId !== 'cohere' &&
        providerId !== 'xai' && providerId !== 'deepinfra' && providerId !== 'togetherai' &&
        providerId !== 'perplexity') {
      // Use createOpenAICompatible for any provider not in the official list.
      const compatMod = _providerFactories.get('__openai-compatible__');
      if (compatMod) {
        createFn = compatMod.createOpenAICompatible || compatMod.default;
        const provider = createFn({
          name: providerId,
          apiKey,
          baseURL: options?.baseURL || undefined,
        });
        return provider(modelId);
      }
      return null;
    }

    if (!createFn) return null;

    // Call the factory with credentials.
    const config: Record<string, unknown> = { apiKey };
    if (options?.baseURL) {
      config.baseURL = options.baseURL;
    }

    const providerInstance = createFn(config);
    // Return the model instance: provider(modelId)
    return providerInstance(modelId);
  } catch (err) {
    console.warn(`[AiSdk] Failed to create model for ${providerId}/${modelId}:`, err);
    return null;
  }
}

/**
 * Get the streamText function from the AI SDK.
 * Returns null if not loaded.
 */
export function getStreamText(): Function | null {
  return _aiSdk?.streamText || null;
}

/**
 * Get the generateText function from the AI SDK.
 * Returns null if not loaded.
 */
export function getGenerateText(): Function | null {
  return _aiSdk?.generateText || null;
}

/**
 * Get the tool function from the AI SDK (for defining tools).
 * Returns null if not loaded.
 */
export function getTool(): Function | null {
  return _aiSdk?.tool || null;
}
