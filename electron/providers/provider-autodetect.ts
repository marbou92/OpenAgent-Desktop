/**
 * OpenAgent-Desktop - Provider Auto-Detector
 *
 * Scans environment variables for API keys and auto-configures providers.
 * Also probes local endpoints (Ollama, LM Studio, etc.) to detect
 * running local providers.
 */

import {
  ProviderType,
  ProviderConfig,
  AutoDetectResult,
} from './types';
import { ProviderRegistry } from './provider-registry';

export class ProviderAutoDetector {
  private registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  async autoDetectProviders(): Promise<AutoDetectResult[]> {
    const results: AutoDetectResult[] = [];

    const envMappings: Array<{
      type: ProviderType;
      keyEnvVar: string;
      hostEnvVar?: string;
      confidence: number;
    }> = [
      { type: ProviderType.anthropic, keyEnvVar: 'ANTHROPIC_API_KEY', hostEnvVar: 'ANTHROPIC_HOST', confidence: 1.0 },
      { type: ProviderType.openai, keyEnvVar: 'OPENAI_API_KEY', hostEnvVar: 'OPENAI_HOST', confidence: 1.0 },
      { type: ProviderType.openrouter, keyEnvVar: 'OPENROUTER_API_KEY', confidence: 1.0 },
      { type: ProviderType.azure_openai, keyEnvVar: 'AZURE_OPENAI_API_KEY', hostEnvVar: 'AZURE_OPENAI_ENDPOINT', confidence: 1.0 },
      { type: ProviderType.gemini, keyEnvVar: 'GOOGLE_API_KEY', confidence: 1.0 },
      { type: ProviderType.groq, keyEnvVar: 'GROQ_API_KEY', confidence: 1.0 },
      { type: ProviderType.mistral, keyEnvVar: 'MISTRAL_API_KEY', confidence: 1.0 },
      { type: ProviderType.perplexity, keyEnvVar: 'PERPLEXITY_API_KEY', confidence: 1.0 },
      { type: ProviderType.cerebras, keyEnvVar: 'CEREBRAS_API_KEY', confidence: 1.0 },
      { type: ProviderType.xai, keyEnvVar: 'XAI_API_KEY', confidence: 1.0 },
      { type: ProviderType.venice, keyEnvVar: 'VENICE_API_KEY', confidence: 1.0 },
      { type: ProviderType.novita, keyEnvVar: 'NOVITA_API_KEY', confidence: 0.9 },
      { type: ProviderType.databricks, keyEnvVar: 'DATABRICKS_TOKEN', hostEnvVar: 'DATABRICKS_HOST', confidence: 0.9 },
      { type: ProviderType.litellm, keyEnvVar: 'LITELLM_API_KEY', confidence: 0.8 },
      { type: ProviderType.github_copilot, keyEnvVar: 'GITHUB_COPILOT_TOKEN', confidence: 0.9 },
    ];

    for (const mapping of envMappings) {
      const apiKey = this.getEnvVar(mapping.keyEnvVar);
      if (!apiKey) continue;

      // Don't add if already configured
      const existing = Array.from(this.registry.getConfigsMap().values()).find(
        (c) => c.type === mapping.type
      );
      if (existing) continue;

      const metadata = this.registry.getProviderMetadata(mapping.type);
      const config: Partial<ProviderConfig> = {
        type: mapping.type,
        name: metadata.displayName,
        apiKey,
        enabled: true,
        isDefault: false,
      };

      if (mapping.hostEnvVar) {
        const host = this.getEnvVar(mapping.hostEnvVar);
        if (host) config.apiHost = host;
      }

      results.push({
        providerType: mapping.type,
        config,
        source: 'environment',
        confidence: mapping.confidence,
      });

      // Auto-register detected provider
      await this.registry.addProvider({
        type: mapping.type,
        name: metadata.displayName,
        apiKey,
        apiHost: config.apiHost,
        enabled: true,
        isDefault: results.length === 0, // First detected is default
      });
    }

    // Detect local providers (no API key needed)
    const localProviders: Array<{ type: ProviderType; host: string; checkPath: string }> = [
      { type: ProviderType.ollama, host: 'http://localhost:11434', checkPath: '/api/tags' },
      { type: ProviderType.lm_studio, host: 'http://localhost:1234', checkPath: '/v1/models' },
      { type: ProviderType.docker_model_runner, host: 'http://localhost:12434', checkPath: '/engines/llama.cpp/v1/models' },
      { type: ProviderType.opencode, host: 'http://localhost:4096', checkPath: '/session' },
    ];

    for (const local of localProviders) {
      const existing = Array.from(this.registry.getConfigsMap().values()).find(
        (c) => c.type === local.type
      );
      if (existing) continue;

      try {
        const response = await fetch(`${local.host}${local.checkPath}`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const metadata = this.registry.getProviderMetadata(local.type);
          results.push({
            providerType: local.type,
            config: {
              type: local.type,
              name: metadata.displayName,
              apiHost: local.host,
              enabled: true,
              isDefault: false,
            },
            source: 'runtime',
            confidence: 0.9,
          });

          await this.registry.addProvider({
            type: local.type,
            name: metadata.displayName,
            apiHost: local.host,
            enabled: true,
            isDefault: false,
          });
        }
      } catch {
        // Not running, skip
      }
    }

    // AWS credentials detection
    const awsAccessKey = this.getEnvVar('AWS_ACCESS_KEY_ID');
    const awsSecretKey = this.getEnvVar('AWS_SECRET_ACCESS_KEY');
    if (awsAccessKey && awsSecretKey) {
      const existingBedrock = Array.from(this.registry.getConfigsMap().values()).find(
        (c) => c.type === ProviderType.amazon_bedrock
      );
      if (!existingBedrock) {
        results.push({
          providerType: ProviderType.amazon_bedrock,
          config: {
            type: ProviderType.amazon_bedrock,
            name: 'Amazon Bedrock',
            apiKey: awsAccessKey,
            customHeaders: { aws_secret_access_key: awsSecretKey },
            region: this.getEnvVar('AWS_REGION') || 'us-east-1',
            enabled: true,
            isDefault: false,
          },
          source: 'environment',
          confidence: 0.9,
        });

        await this.registry.addProvider({
          type: ProviderType.amazon_bedrock,
          name: 'Amazon Bedrock',
          apiKey: awsAccessKey,
          customHeaders: { aws_secret_access_key: awsSecretKey },
          region: this.getEnvVar('AWS_REGION') || 'us-east-1',
          enabled: true,
          isDefault: false,
        });
      }
    }

    // GCP detection
    const gcpProject = this.getEnvVar('GCP_PROJECT_ID') || this.getEnvVar('GOOGLE_CLOUD_PROJECT');
    if (gcpProject) {
      const existingVertex = Array.from(this.registry.getConfigsMap().values()).find(
        (c) => c.type === ProviderType.gcp_vertex
      );
      if (!existingVertex) {
        results.push({
          providerType: ProviderType.gcp_vertex,
          config: {
            type: ProviderType.gcp_vertex,
            name: 'GCP Vertex AI',
            projectId: gcpProject,
            region: this.getEnvVar('GCP_LOCATION') || 'us-central1',
            enabled: true,
            isDefault: false,
          },
          source: 'environment',
          confidence: 0.8,
        });

        await this.registry.addProvider({
          type: ProviderType.gcp_vertex,
          name: 'GCP Vertex AI',
          projectId: gcpProject,
          region: this.getEnvVar('GCP_LOCATION') || 'us-central1',
          enabled: true,
          isDefault: false,
        });
      }
    }

    return results;
  }

  private getEnvVar(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }
}
