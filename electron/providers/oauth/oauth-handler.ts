/**
 * OpenAgent-Desktop - OAuth Handler
 *
 * Implements the OAuth 2.0 Authorization Code flow with PKCE for desktop apps.
 *
 * Flow:
 *   1. UI calls oauth:startFlow(providerId)
 *   2. We generate a code_verifier + code_challenge (S256), build the
 *      authorization URL, and open it in the system browser via shell.openExternal.
 *   3. We register a one-time pending-flow entry keyed by `state`.
 *   4. The user authorizes in the browser; the provider redirects to
 *      `openagent-desktop://oauth/callback?code=...&state=...`.
 *   5. main.ts's deep-link handler calls oauthHandleCallback(url).
 *   6. We exchange the code for tokens (POST to tokenEndpoint with the code_verifier).
 *   7. We update the ConfiguredProvider in the AuthStore and emit 'flow-completed'.
 *
 * Token refresh: access tokens expire. The AuthStore stores expiresAt; the
 * provider client checks the expiry before each call and refreshes if needed
 * (refreshOauthToken below).
 */

import * as crypto from 'crypto';
import { shell } from 'electron';
import { EventEmitter } from 'events';
import { AuthStore } from '../auth-store';
import { OAuthAuth } from '../v3-types';
import {
  OAUTH_PROVIDERS,
  OAuthProviderConfig as RuntimeOAuthProviderConfig,
  buildRedirectUri,
} from './oauth-providers';

interface PendingFlow {
  providerId: string;
  state: string;
  codeVerifier: string;
  startedAt: number;
}

const FLOW_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class OAuthHandler extends EventEmitter {
  private pending: Map<string, PendingFlow> = new Map();

  constructor(private authStore: AuthStore) {
    super();
    // Periodically clean up stale pending flows.
    setInterval(() => this.cleanupStaleFlows(), 60_000).unref();
  }

  /**
   * Start an OAuth flow for the given provider. Returns the authorization URL
   * (also opened in the browser). The UI should show a "Waiting for browser
   * authorization..." spinner; the 'flow-completed' / 'flow-error' events
   * signal the outcome.
   */
  async startFlow(providerId: string, customClientId?: string): Promise<{ authorizationUrl: string }> {
    const config = this.getProviderConfig(providerId);
    if (!config) throw new Error(`No OAuth config for provider '${providerId}'`);

    const clientId = customClientId || config.clientId;
    if (!clientId) {
      throw new Error(
        `No client ID configured for ${providerId} OAuth. Register an OAuth app with the provider ` +
        `and supply the client ID in the provider settings.`
      );
    }

    // PKCE
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = crypto.randomBytes(16).toString('hex');

    this.pending.set(state, {
      providerId,
      state,
      codeVerifier,
      startedAt: Date.now(),
    });

    const redirectUri = buildRedirectUri();
    const authUrl = new URL(config.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', config.scopes.join(' '));
    if (config.usePkce) {
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }

    // Open in the system browser.
    await shell.openExternal(authUrl.toString());

    return { authorizationUrl: authUrl.toString() };
  }

  /**
   * Handle the redirect URL when the browser bounces back to
   * `openagent-desktop://oauth/callback?code=...&state=...`.
   */
  async handleCallback(url: string): Promise<void> {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const error = parsed.searchParams.get('error');
    const errorDescription = parsed.searchParams.get('error_description');

    if (error) {
      this.emit('flow-error', { state, error, description: errorDescription });
      return;
    }
    if (!code || !state) {
      this.emit('flow-error', { state, error: 'invalid_callback', description: 'Missing code or state in callback URL' });
      return;
    }

    const flow = this.pending.get(state);
    if (!flow) {
      this.emit('flow-error', { state, error: 'unknown_state', description: 'No pending OAuth flow for this state' });
      return;
    }
    this.pending.delete(state);

    try {
      const config = this.getProviderConfig(flow.providerId);
      if (!config) throw new Error(`No OAuth config for provider '${flow.providerId}'`);

      // Exchange code for tokens.
      const tokenResponse = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: buildRedirectUri(),
          client_id: config.clientId,
          code_verifier: flow.codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        throw new Error(`Token exchange failed (${tokenResponse.status}): ${text}`);
      }
      const tokens = await tokenResponse.json() as any;

      const auth: OAuthAuth = {
        method: 'oauth',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        scope: tokens.scope,
      };

      // Persist in the AuthStore.
      const existing = this.authStore.getProvider(flow.providerId);
      if (existing) {
        this.authStore.upsertProvider({ ...existing, auth });
      } else {
        // The user hasn't filled in a label yet — emit a 'needs-config' event
        // so the UI can prompt them to complete the provider entry.
        this.emit('needs-config', { providerId: flow.providerId, auth });
      }

      this.emit('flow-completed', { providerId: flow.providerId });
    } catch (err) {
      this.emit('flow-error', {
        state,
        error: 'token_exchange_failed',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Refresh an expired access token using the stored refresh token.
   * Returns the new OAuthAuth entry, or null if refresh failed.
   */
  async refreshOauthToken(providerId: string): Promise<OAuthAuth | null> {
    const config = this.getProviderConfig(providerId);
    if (!config) return null;
    const configured = this.authStore.getProvider(providerId);
    if (!configured || configured.auth.method !== 'oauth' || !configured.auth.refreshToken) {
      return null;
    }

    try {
      const tokenResponse = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: configured.auth.refreshToken,
          client_id: config.clientId,
        }).toString(),
      });
      if (!tokenResponse.ok) return null;
      const tokens = await tokenResponse.json() as any;
      const newAuth: OAuthAuth = {
        method: 'oauth',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || configured.auth.refreshToken,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        scope: tokens.scope || configured.auth.scope,
      };
      this.authStore.upsertProvider({ ...configured, auth: newAuth });
      return newAuth;
    } catch {
      return null;
    }
  }

  private getProviderConfig(providerId: string): RuntimeOAuthProviderConfig | null {
    const config = OAUTH_PROVIDERS[providerId];
    if (!config) return null;
    return config;
  }

  private cleanupStaleFlows(): void {
    const now = Date.now();
    for (const [state, flow] of this.pending.entries()) {
      if (now - flow.startedAt > FLOW_TIMEOUT_MS) {
        this.pending.delete(state);
        this.emit('flow-error', { state, error: 'timeout', description: 'OAuth flow timed out after 5 minutes' });
      }
    }
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
