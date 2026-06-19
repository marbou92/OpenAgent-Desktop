/**
 * OpenAgent-Desktop - Cost Calculator (Phase 4)
 *
 * Estimates the dollar cost of a chat request based on token usage and
 * the model's pricing from the models.dev catalog.
 *
 * Pricing is stored per-model in the catalog as:
 *   cost: { input: number, output: number }  // per 1M tokens
 *
 * If pricing isn't available, returns 0 and the caller can show "—".
 */

import { getModelsDevClient } from './models-dev-client';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  hasPricing: boolean;
}

/**
 * Calculate the estimated cost for a single chat exchange.
 *
 * @param providerId — e.g. "openai"
 * @param modelId — e.g. "gpt-4o"
 * @param usage — token counts from the AI SDK's result.usage
 * @returns CostEstimate with input/output/total cost in USD
 */
export function calculateCost(
  providerId: string,
  modelId: string,
  usage: TokenUsage
): CostEstimate {
  const client = getModelsDevClient();
  const providers = client.getMergedProviders();
  const provider = providers.find(p => p.id === providerId);

  if (!provider || !provider.models) {
    return { inputCost: 0, outputCost: 0, totalCost: 0, hasPricing: false };
  }

  const model = provider.models[modelId];
  if (!model || !model.cost) {
    return { inputCost: 0, outputCost: 0, totalCost: 0, hasPricing: false };
  }

  // model.cost.input / .output are per 1M tokens
  const inputCostPerToken = (model.cost.input || 0) / 1_000_000;
  const outputCostPerToken = (model.cost.output || 0) / 1_000_000;

  const inputCost = usage.promptTokens * inputCostPerToken;
  const outputCost = usage.completionTokens * outputCostPerToken;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    hasPricing: true,
  };
}

/**
 * Format a cost as a human-readable string.
 * - $0.00 if cost is 0
 * - $0.0001 for very small amounts (4 decimal places)
 * - $0.01 for normal amounts (2 decimal places)
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with thousand separators.
 */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}
