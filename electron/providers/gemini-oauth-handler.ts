/**
 * OpenAgent-Desktop — Gemini OAuth Handler (Phase 8.7)
 *
 * Implements Google's OAuth 2.0 with PKCE for the Gemini (Free OAuth)
 * provider. Uses the same public client ID as the Gemini CLI — this gives
 * free access to Gemini models via Google's Code Assist API.
 *
 * Flow:
 *   1. UI calls start() → we start a local HTTP server on a random port,
 *      build the Google OAuth URL, and open it in the system browser.
 *   2. The user signs in with their Google account and grants permission.
 *   3. Google redirects to http://localhost:{port}/callback?code=...&state=...
 *   4. We exchange the code for access + refresh tokens.
 *   5. We return the tokens to the caller (main.ts) which stores them in
 *      AuthStore v2 as { type: 'oauth', access, refresh, expires }.
 *
 * The local HTTP server is closed immediately after the callback is received.
 * No long-running listener, no port conflicts.
 *
 * Reference: https://github.com/google-gemini/gemini-cli (OAuth client config)
 */

import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import { shell } from 'electron';

// Google OAuth 2.0 endpoints.
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// The Gemini CLI's public OAuth client ID. This is embedded in the
// open-source Gemini CLI and is intended for desktop applications.
// Using it gives us free access to the Code Assist API (same as the CLI).
const GEMINI_CLI_CLIENT_ID = '590929176870-7isvia9buq5jq8qf8h2r4pv11trf8hmq.apps.googleusercontent.com';

// Scopes required for the Code Assist API + user identification.
const GEMINI_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface GeminiOAuthResult {
  access: string;
  refresh: string;
  expiresAt: number; // epoch ms
  accountId?: string;
}

/**
 * Start the Gemini OAuth flow. Opens the system browser for the user to
 * sign in, waits for the callback, exchanges the code for tokens, and
 * returns the result. Throws on any error (user cancels, network failure,
 * token exchange failure, timeout).
 *
 * @param timeoutMs How long to wait for the user to complete the browser
 *                  sign-in. Default 5 minutes.
 */
export async function startGeminiOAuthFlow(timeoutMs: number = 5 * 60 * 1000): Promise<GeminiOAuthResult> {
  // PKCE: generate code_verifier + code_challenge (S256).
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = crypto.randomBytes(16).toString('hex');

  // Start a local HTTP server on a random port. Google OAuth supports
  // loopback redirect URIs (http://localhost:{port}) for desktop apps.
  const { server, port, callbackPromise } = await startCallbackServer(state);

  const redirectUri = `http://localhost:${port}/callback`;

  // Build the authorization URL.
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', GEMINI_CLI_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GEMINI_OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  // 'consent' forces Google to show the consent screen + return a refresh token.
  // Without this, Google may skip the consent screen for repeat users and
  // not return a refresh token — which means we can't refresh the access token
  // when it expires.
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('access_type', 'offline');

  // Open the system browser.
  await shell.openExternal(authUrl.toString());

  try {
    // Wait for the callback (or timeout).
    const callback = await Promise.race([
      callbackPromise,
      timeoutPromise(timeoutMs, 'OAuth flow timed out — the browser sign-in was not completed in time.'),
    ]);

    // Close the server — we have the callback.
    server.close();

    // Exchange the authorization code for tokens.
    const tokenResponse = await exchangeCodeForTokens(
      callback.code,
      codeVerifier,
      redirectUri,
    );

    return {
      access: tokenResponse.access_token,
      refresh: tokenResponse.refresh_token,
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      accountId: tokenResponse.id_token ? extractEmailFromIdToken(tokenResponse.id_token) : undefined,
    };
  } catch (err) {
    server.close();
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CallbackResult {
  code: string;
  state: string;
}

/**
 * Start a local HTTP server that listens for the OAuth callback redirect.
 * Returns the server, the port it's listening on, and a promise that
 * resolves when the callback is received.
 */
function startCallbackServer(expectedState: string): Promise<{
  server: http.Server;
  port: number;
  callbackPromise: Promise<CallbackResult>;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url || '', true);

      // Only handle the /callback path.
      if (parsed.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = parsed.query.code as string | undefined;
      const state = parsed.query.state as string | undefined;
      const error = parsed.query.error as string | undefined;

      // Respond to the browser with a simple HTML page.
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h2>Authorization cancelled</h2><p>You can close this tab and return to OpenAgent-Desktop.</p></body></html>`);
        // Reject the callback promise — the caller will catch this.
        callbackReject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Missing code or state</h2><p>Please try again.</p></body></html>');
        callbackReject(new Error('OAuth callback missing code or state'));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>State mismatch</h2><p>Security error — please try again.</p></body></html>');
        callbackReject(new Error('OAuth state mismatch — possible CSRF attack'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ Authorization successful</h2><p>You can close this tab and return to OpenAgent-Desktop.</p></body></html>`);

      callbackResolve({ code, state });
    });

    let callbackResolve!: (r: CallbackResult) => void;
    let callbackReject!: (e: Error) => void;
    const callbackPromise = new Promise<CallbackResult>((res, rej) => {
      callbackResolve = res;
      callbackReject = rej;
    });

    // Listen on port 0 = let the OS assign a random available port.
    server.on('error', (err) => {
      reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string' || typeof addr === 'number') {
        reject(new Error('Failed to get server port'));
        return;
      }
      resolve({ server, port: addr.port, callbackPromise });
    });
  });
}

/**
 * Exchange the authorization code for access + refresh tokens.
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}> {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    client_id: GEMINI_CLI_CLIENT_ID,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${text}`);
  }

  const json = await res.json() as any;

  if (!json.access_token) {
    throw new Error(`Token exchange succeeded but no access_token in response: ${JSON.stringify(json)}`);
  }

  // Google may not return a refresh_token on repeat authorizations if
  // prompt=consent wasn't set. We set it above, but some Google client
  // configs still suppress it. If we don't get one, warn but continue —
  // the access token will work until it expires (1 hour).
  if (!json.refresh_token) {
    console.warn('[GeminiOAuth] No refresh_token returned — access token will expire in ~1 hour and cannot be refreshed automatically. Re-authorize to get a refresh token.');
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || '',
    expires_in: json.expires_in || 3600,
    id_token: json.id_token,
  };
}

/**
 * Decode the JWT id_token to extract the user's email address.
 * JWT format: header.payload.signature (base64url-encoded JSON segments).
 */
function extractEmailFromIdToken(idToken: string): string | undefined {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return undefined;
    const payload = JSON.parse(Buffer.from(base64urlToBase64(parts[1]), 'base64').toString('utf-8'));
    return payload?.email;
  } catch {
    return undefined;
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBase64(s: string): string {
  let str = s.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return str;
}

function timeoutPromise(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
