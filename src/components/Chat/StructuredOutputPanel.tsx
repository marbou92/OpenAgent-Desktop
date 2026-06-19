/**
 * OpenAgent-Desktop - Structured Output Panel (Phase 4)
 *
 * A modal dialog for the /structure slash command. Lets the user:
 *   1. Enter a prompt
 *   2. Define a JSON schema (or pick a preset)
 *   3. Get a typed JSON object back from the LLM via generateObject()
 *
 * Presets:
 *   - Summary: { summary: string, keyPoints: string[] }
 *   - Data extraction: { entities: Array<{ name: string, type: string, value: string }> }
 *   - Classification: { category: string, confidence: number, reasoning: string }
 *   - Custom: user-defined schema
 *
 * The result is displayed as formatted JSON with a copy button.
 */

import React, { useState, useCallback } from 'react';
import { getAPI } from '../../utils/api';

interface StructuredOutputPanelProps {
  open: boolean;
  onClose: () => void;
  model: string; // "providerId/modelId"
  systemPrompt?: string;
}

const PRESETS: { label: string; description: string; schema: Record<string, unknown> }[] = [
  {
    label: 'Summary',
    description: 'Summarize text with key points',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'A concise summary' },
        keyPoints: { type: 'array', items: { type: 'string' }, description: 'Key bullet points' },
      },
      required: ['summary', 'keyPoints'],
    },
  },
  {
    label: 'Data Extraction',
    description: 'Extract structured entities from text',
    schema: {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['name', 'type', 'value'],
          },
        },
      },
      required: ['entities'],
    },
  },
  {
    label: 'Classification',
    description: 'Classify text into a category',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'The classification category' },
        confidence: { type: 'number', description: 'Confidence score 0-1' },
        reasoning: { type: 'string', description: 'Why this category' },
      },
      required: ['category', 'confidence', 'reasoning'],
    },
  },
  {
    label: 'Custom',
    description: 'Define your own JSON schema',
    schema: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'The result' },
      },
      required: ['result'],
    },
  },
];

const StructuredOutputPanel: React.FC<StructuredOutputPanelProps> = ({
  open,
  onClose,
  model,
  systemPrompt,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [schemaText, setSchemaText] = useState(JSON.stringify(PRESETS[0].schema, null, 2));
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = getAPI();

  const handlePresetChange = useCallback((idx: number) => {
    setSelectedPreset(idx);
    setSchemaText(JSON.stringify(PRESETS[idx].schema, null, 2));
    setResult(null);
    setError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !model) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let schema: Record<string, unknown>;
      try {
        schema = JSON.parse(schemaText);
      } catch {
        setError('Invalid JSON schema — check the syntax');
        setLoading(false);
        return;
      }

      if (!api?.chat?.generateObject) {
        setError('Structured outputs not available in this build');
        setLoading(false);
        return;
      }

      const response = await api.chat.generateObject({
        model,
        messages: [{
          id: crypto.randomUUID(),
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        }],
        schema,
        systemPrompt,
      } as any);

      if (!response.success) {
        setError(response.error || 'Failed to generate structured output');
        setLoading(false);
        return;
      }

      setResult(JSON.stringify((response as any).object, null, 2));
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [prompt, schemaText, model, systemPrompt, api]);

  const handleCopyResult = useCallback(() => {
    if (result) {
      navigator.clipboard.writeText(result);
    }
  }, [result]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--color-border-secondary)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Structured Output
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Model info */}
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Model: <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{model || 'None selected'}</span>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the LLM to extract or generate…"
              rows={3}
              className="w-full text-sm rounded-lg p-3 outline-none resize-none"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-primary)',
              }}
            />
          </div>

          {/* Preset selector */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Schema Preset
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset, idx) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetChange(idx)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: selectedPreset === idx ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
                    color: selectedPreset === idx ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    border: selectedPreset === idx ? '1px solid var(--color-accent)' : '1px solid var(--color-border-primary)',
                  }}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schema editor */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              JSON Schema
            </label>
            <textarea
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              rows={8}
              className="w-full text-xs font-mono rounded-lg p-3 outline-none resize-none"
              style={{
                background: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-primary)',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' }}
            >
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  Result
                </label>
                <button
                  onClick={handleCopyResult}
                  className="text-[10px] px-2 py-0.5 rounded transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  Copy
                </button>
              </div>
              <pre
                className="text-xs font-mono rounded-lg p-3 overflow-auto max-h-48"
                style={{
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-primary)',
                }}
              >
                {result}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: 'var(--color-border-secondary)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            Close
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !model || loading}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'white' }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'var(--color-accent)'; }}
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StructuredOutputPanel;
