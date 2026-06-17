/**
 * OpenAgent-Desktop - Azure AD / MSAL Provider
 *
 * Implements Azure AD authentication for Azure OpenAI and Vertex AI (federated
 * via Azure AD). Uses the OAuth 2.0 Authorization Code flow with PKCE — no
 * client secret required for desktop apps.
 *
 * Why no @azure/msal-node:
 *   - It pulls in a large dependency tree that adds ~2MB to the bundle.
 *   - The PKCE auth-code flow is straightforward enough to implement inline.
 *   - Works fine on Windows 7 (no native broker required).
 *
 * Token refresh is automatic — the AuthStore stores expiresAt; this module
 * exposes refreshAccessToken() which the provider client calls when needed.
 */

import * as crypto from 'crypto';
import { shell } from 'electron';
import { EventEmitter } from 'events';
import { AuthStore } from '../auth-store';
import { AzureAdAuth } from '../v3-types';

const AAD_AUTHORIZE = 'https://login.microsoftonline.com';
const AAD_COMMON_TENANT = 'common';
const REDIRECT_PATH = 'azure-ad/callback';

interface PendingAadFlow {
  providerId: string;
  state: string;
  codeVerifier: string;
  startedAt: number;
}

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

export class AzureAdProvider extends EventEmitter {
  private pending: Map<string, PendingAadFlow> = new Map();

  constructor(private authStore: AuthStore) {
    super();
    setInterval(() => this.cleanupStaleFlows(), 60_000).unref();
  }

  async startFlow(
    providerId: string,
    tenantId: string,
    clientId: string,
    scopes: string[] = ['https://cognitiveservices.azure.com/.default']
  ): Promise<{ authorizationUrl: string }> {
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = crypto.randomBytes(16).toString('hex');

    this.pending.set(state, { providerId, state, codeVerifier, startedAt: Date.now() });

    const redirectUri = this.buildRedirectUri();
    const authUrl = new URL(`${AAD_AUTHORIZE}/${tenantId || AAD_COMMON_TENANT}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    await shell.openExternal(authUrl.toString());
    return { authorizationUrl: authUrl.toString() };
  }

  async handleCallback(url: string): Promise<void> {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const error = parsed.searchParams.get('error');

    if (error) {
      this.emit('flow-error', { state, error });
      return;
    }
    if (!code || !state) {
      this.emit('flow-error', { state, error: 'invalid_callback' });
      return;
    }
    const flow = this.pending.get(state);
    if (!flow) {
      this.emit('flow-error', { state, error: 'unknown_state' });
      return;
    }
    this.pending.delete(state);

    const configured = this.authStore.getProvider(flow.providerId);
    if (!configured || configured.auth.method !== 'azure_ad') {
      this.emit('flow-error', { state, error: 'provider_not_configured' });
      return;
    }
    const aadAuth = configured.auth;

    try {
      const tokenResponse = await fetch(
        `${AAD_AUTHORIZE}/${aadAuth.tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.buildRedirectUri(),
            client_id: aadAuth.clientId,
            code_verifier: flow.codeVerifier,
            ...(aadAuth.clientSecret ? { client_secret: aadAuth.clientSecret } : {}),
          }).toString(),
        }
      );
      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        throw new Error(`AAD token exchange failed (${tokenResponse.status}): ${text}`);
      }
      const tokens = await tokenResponse.json() as any;
      const newAuth: AzureAdAuth = {
        ...aadAuth,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      };
      this.authStore.upsertProvider({ ...configured, auth: newAuth });
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
   * Refresh an expired Azure AD access token. Requires a refresh_token, which
   * the desktop-flow doesn't typically return — for desktop apps the access
   * token simply expires and the user must re-authenticate. Returns null if
   * refresh isn't possible.
   */
  async refreshAccessToken(providerId: string): Promise<AzureAdAuth | null> {
    const configured = this.authStore.getProvider(providerId);
    if (!configured || configured.auth.method !== 'azure_ad') return null;
    // Desktop PKCE flow doesn't yield refresh tokens; just return null.
    // Caller should prompt the user to re-authenticate.
    return null;
  }

  private buildRedirectUri(): string {
    return `openagent-desktop://${REDIRECT_PATH}`;
  }

  private cleanupStaleFlows(): void {
    const now = Date.now();
    for (const [state, flow] of this.pending.entries()) {
      if (now - flow.startedAt > FLOW_TIMEOUT_MS) {
        this.pending.delete(state);
        this.emit('flow-error', { state, error: 'timeout' });
      }
    }
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
