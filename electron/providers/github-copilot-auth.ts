/**
 * OpenAgent-Desktop - GitHub Copilot Auth (Device Flow)
 *
 * GitHub Copilot uses the OAuth 2.0 Device Authorization Grant flow:
 *   1. We request a device code from GitHub.
 *   2. The user opens https://github.com/login/device and enters the code.
 *   3. We poll GitHub until the user authorizes.
 *   4. We store the resulting token as a WellKnownAuth entry in auth.json.
 *
 * The client_id is the well-known Copilot VS Code extension client ID
 * (Iv1.b507a08c87ecfe98) — same one opencode uses. This is a public client
 * ID (no client secret needed for the device flow).
 *
 * The resulting token is used to call the Copilot API at
 * https://api.githubcopilot.com (which is OpenAI-compatible).
 */

import { EventEmitter } from 'events';
import { shell } from 'electron';
import { AuthStore } from './auth-store-v2';
import { WellKnownAuth } from './opencode-types';

const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const _GITHUB_DEVICE_URL = 'https://github.com/login/device';
const COPILOT_PROVIDER_ID = 'github-copilot';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

export class GithubCopilotAuth extends EventEmitter {
  private polling = false;

  constructor(private authStore: AuthStore) {
    super();
  }

  /**
   * Start the device flow. Opens the browser for the user to authorize.
   * Polls until the user authorizes or the flow expires.
   */
  async startDeviceFlow(): Promise<{ userCode: string; verificationUri: string }> {
    // Request a device code.
    const response = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'read:user',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub device code request failed: ${response.status}`);
    }
    const data = (await response.json()) as DeviceCodeResponse;

    // Open the browser for the user to enter the code.
    await shell.openExternal(data.verification_uri);

    // Start polling in the background.
    this.polling = true;
    this.pollForToken(data.device_code, data.interval, data.expires_in);

    return {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
    };
  }

  /**
   * Poll GitHub for the access token until the user authorizes or the flow expires.
   */
  private async pollForToken(deviceCode: string, interval: number, expiresIn: number): Promise<void> {
    const deadline = Date.now() + expiresIn * 1000;
    const pollInterval = (interval + 1) * 1000; // +1s to avoid rate limiting

    while (this.polling && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      if (!this.polling) return;

      try {
        const response = await fetch(GITHUB_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) continue;
        const data = (await response.json()) as TokenResponse;

        if (data.error) {
          if (data.error === 'authorization_pending' || data.error === 'slow_down') {
            continue; // Keep polling.
          }
          this.emit('error', { error: data.error, description: data.error_description });
          this.polling = false;
          return;
        }

        if (data.access_token) {
          // Store as WellKnownAuth.
          const auth: WellKnownAuth = {
            type: 'wellknown',
            key: 'github',
            token: data.access_token,
          };
          this.authStore.set(COPILOT_PROVIDER_ID, auth);
          this.emit('completed', { providerId: COPILOT_PROVIDER_ID });
          this.polling = false;
          return;
        }
      } catch {
        // Network error — keep polling.
      }
    }

    if (this.polling) {
      this.emit('error', { error: 'timeout', description: 'Device flow expired' });
      this.polling = false;
    }
  }

  /** Cancel an in-progress device flow. */
  cancel(): void {
    this.polling = false;
    this.emit('cancelled');
  }

  /** Check if Copilot is authenticated. */
  isAuthenticated(): boolean {
    return this.authStore.isConfigured(COPILOT_PROVIDER_ID);
  }

  /** Get the stored Copilot token (for the protocol adapter). */
  getToken(): string | null {
    const auth = this.authStore.get(COPILOT_PROVIDER_ID);
    if (auth?.type === 'wellknown') return auth.token;
    return null;
  }
}
