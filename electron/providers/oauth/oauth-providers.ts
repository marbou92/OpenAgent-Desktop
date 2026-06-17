/**
 * OpenAgent-Desktop - OAuth Provider Configurations
 *
 * Per-provider OAuth 2.0 settings (authorization URL, token URL, scopes,
 * redirect URI). The OAuth handler opens the authorization URL in the system
 * browser; the user authorizes; the browser redirects back to our custom
 * protocol handler; we exchange the code for tokens.
 *
 * Currently configured for:
 *   - Anthropic (https://console.anthropic.com/oauth/authorize)
 *   - OpenAI (https://platform.openai.com/oauth/authorize — limited scope support)
 *
 * Google uses its own OAuth flow with different scopes per product (Vertex,
 * Cloud, etc.) — left as a TODO since Vertex primarily uses service-account
 * auth (which the Vertex adapter handles via GOOGLE_VERTEX_ACCESS_TOKEN).
 */

export interface OAuthProviderConfig {
  providerId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string; // PKCE-only flows don't need this
  scopes: string[];
  /** Whether to use PKCE (recommended for desktop apps). */
  usePkce: boolean;
}

// These client IDs are placeholder values. Real OAuth clients need to be
// registered with each provider and the IDs shipped with the app (or fetched
// from a config server). For now, users must register their own OAuth apps
// and supply the client id via the provider config UI; this is documented
// in the README.
export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  anthropic: {
    providerId: 'anthropic',
    authorizationEndpoint: 'https://console.anthropic.com/oauth/authorize',
    tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
    clientId: '', // user-supplied
    scopes: ['completions:write', 'messages:write'],
    usePkce: true,
  },
  openai: {
    providerId: 'openai',
    authorizationEndpoint: 'https://platform.openai.com/oauth/authorize',
    tokenEndpoint: 'https://api.openai.com/v1/oauth/token',
    clientId: '', // user-supplied
    scopes: ['openai.chat.write'],
    usePkce: true,
  },
};

// Custom protocol used for OAuth redirects.
export const OAUTH_REDIRECT_PROTOCOL = 'openagent-desktop';
export const OAUTH_REDIRECT_PATH = 'oauth/callback';

export function buildRedirectUri(): string {
  return `${OAUTH_REDIRECT_PROTOCOL}://${OAUTH_REDIRECT_PATH}`;
}
