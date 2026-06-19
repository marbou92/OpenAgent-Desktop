/**
 * OpenAgent-Desktop - fetch globals polyfill (Win7 / Electron 22 / Node 16)
 *
 * This module polyfills `fetch`, `Headers`, `Request`, `Response`,
 * `ReadableStream`, `FormData`, `Blob`, and `File` on `globalThis`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Electron 22 ships Node 16.x, which has NO global `fetch`. The Vercel AI
 * SDK AND our hand-rolled protocol adapters (openai-adapter, anthropic-
 * adapter, gemini-adapter, github-copilot-adapter, the custom-provider
 * protocols, the opencode bridge, the msal-provider, etc.) all call
 * `fetch()` directly. Without this polyfill, every one of those calls
 * throws `ReferenceError: fetch is not defined` on Windows 7.
 *
 * The previous fix (in `ai-sdk-loader.ts`) only polyfilled lazily, on the
 * first chat, AND only when the AI SDK path was taken. That left the
 * protocol-adapter fallback path uncovered — so if the AI SDK failed to
 * load for any provider, the next `fetch()` call in the adapter threw.
 *
 * This module is imported at the very top of `electron/main.ts`, BEFORE
 * any other subsystem import, so the polyfill is in place for every
 * `fetch()` call across the entire main process — regardless of which
 * code path runs first.
 *
 * ORDER MATTERS
 * -------------
 * undici v6 references `ReadableStream` at module-load time (in
 * `lib/web/fetch/response.js`), so it CANNOT be required unless
 * `ReadableStream` is already on globalThis. We must install the Node
 * built-in stream/web globals (ReadableStream, WritableStream,
 * TransformStream) BEFORE requiring undici. Same for Blob — undici
 * references it on load too.
 *
 * Sources, in install order:
 *   1. `stream/web` (Node 16.5+ built-in)  → ReadableStream, WritableStream, TransformStream
 *   2. `buffer`     (Node 15.7+ built-in)  → Blob
 *   3. `undici`     (npm package)          → fetch, Headers, Request, Response, FormData, File
 *
 * On Node 18+ (Electron 28+) all of these exist natively on globalThis,
 * so this module is a no-op.
 *
 * USAGE
 * -----
 *   // electron/main.ts — FIRST import, before anything else:
 *   import './polyfills/fetch-globals';
 *
 * The side-effect import is intentional — the module self-invokes.
 */

// ─── Step 1: Install stream/web globals BEFORE requiring undici ─────────────
// undici v6 throws `ReadableStream is not defined` at module-load time if
// this isn't done first.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webStreams: any = (() => {
  try {
    return require('stream/web');
  } catch {
    return null;
  }
})();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bufferMod: any = (() => {
  try {
    return require('buffer');
  } catch {
    return null;
  }
})();

// Install stream + Blob globals first (undici depends on these at require time).
const preInstalled: string[] = [];
if (webStreams) {
  for (const name of ['ReadableStream', 'WritableStream', 'TransformStream'] as const) {
    if (typeof (globalThis as any)[name] === 'undefined' && webStreams[name]) {
      (globalThis as any)[name] = webStreams[name];
      preInstalled.push(name);
    }
  }
}
if (bufferMod) {
  if (typeof (globalThis as any).Blob === 'undefined' && bufferMod.Blob) {
    (globalThis as any).Blob = bufferMod.Blob;
    preInstalled.push('Blob');
  }
}

// ─── Step 2: NOW safe to require undici ───────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const undici: any = (() => {
  try {
    return require('undici');
  } catch {
    return null;
  }
})();

// ─── Step 3: Install the fetch API globals from undici ───────────────────────
interface FetchGlobalSource {
  name: string;
  undiciKey?: string;
}

const UNDICI_GLOBALS: FetchGlobalSource[] = [
  { name: 'fetch', undiciKey: 'fetch' },
  { name: 'Headers', undiciKey: 'Headers' },
  { name: 'Request', undiciKey: 'Request' },
  { name: 'Response', undiciKey: 'Response' },
  { name: 'FormData', undiciKey: 'FormData' },
  { name: 'File', undiciKey: 'File' },
  // TextEncoder / TextDecoder are global since Node 11, but include for safety.
  { name: 'TextEncoder', undiciKey: 'TextEncoder' },
  { name: 'TextDecoder', undiciKey: 'TextDecoder' },
];

let _polyfilled: string[] = [];

function applyPolyfill(): void {
  // Fast path: if globalThis.fetch already exists (Node 18+ / Electron 28+),
  // assume all the other fetch-related globals are present too. Skip.
  if (typeof (globalThis as any).fetch === 'function') {
    return;
  }

  if (!undici) {
    // No undici and no native fetch — this is a hard failure on Win7.
    console.error(
      '[polyfills/fetch-globals] globalThis.fetch is missing AND undici is not installed. ' +
      'Chat will not work. Run `npm install undici` to fix.'
    );
    return;
  }

  const installed: string[] = [];
  for (const g of UNDICI_GLOBALS) {
    const existing = (globalThis as any)[g.name];
    if (typeof existing === 'undefined' || existing === null) {
      const candidate = g.undiciKey ? undici[g.undiciKey] : undefined;
      if (candidate) {
        (globalThis as any)[g.name] = candidate;
        installed.push(g.name);
      }
    }
  }

  _polyfilled = [...preInstalled, ...installed];

  if (installed.length > 0 || preInstalled.length > 0) {
    console.info(
      `[polyfills/fetch-globals] Installed ${_polyfilled.length} fetch globals ` +
      `(${_polyfilled.join(', ')})`
    );
  } else {
    console.warn(
      '[polyfills/fetch-globals] No globals needed installation but fetch is still missing — ' +
      'this is unexpected on Node 16. Check that undici is installed correctly.'
    );
  }
}

// Self-invoke on import. This is the whole point of the module — it must
// run BEFORE any other code that calls fetch().
applyPolyfill();

/** Returns the list of globals this module polyfilled. Empty on Node 18+. */
export function getPolyfilledGlobals(): readonly string[] {
  return _polyfilled;
}

/** True if the polyfill installed at least one global. */
export function isPolyfillActive(): boolean {
  return _polyfilled.length > 0;
}

// Re-export for tests / explicit re-application if ever needed.
export { applyPolyfill };
