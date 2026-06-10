/**
 * OpenAgent Desktop - Auto Visualiser Extension
 *
 * Generate charts and diagrams via MCP-UI protocol:
 * - create_chart: Auto-generate chart (bar, line, pie, scatter, etc.)
 * - create_diagram: Create diagram (flowchart, mindmap, sequence, etc.)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolDefinition,
  ToolResult,
  Permission,
  PermissionLevel,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Chart and diagram types
// ─────────────────────────────────────────────────────────────────────────────

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'heatmap' | 'radar' | 'candlestick' | 'histogram' | 'treemap' | 'boxplot' | 'funnel';
type DiagramType = 'flowchart' | 'mindmap' | 'sequence' | 'class' | 'state' | 'er' | 'gantt' | 'pie' | 'gitgraph';

interface ChartData {
  labels?: string[];
  datasets?: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    fill?: boolean;
  }>;
  values?: number[];
  items?: Array<{ label: string; value: number; color?: string }>;
  points?: Array<{ x: number; y: number; label?: string }>;
  matrix?: number[][];
}

interface ChartOptions {
  title?: string;
  width?: number;
  height?: number;
  colors?: string[];
  legend?: boolean;
  gridLines?: boolean;
  animated?: boolean;
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto Visualiser Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class AutoVisualiserExtension extends BaseExtension {
  private outputDir: string;
  private defaultColors: string[] = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
  ];

  constructor(config: ExtensionConfig) {
    super(config);
    this.outputDir = this.getSetting<string>(
      'outputDir',
      path.join(os.homedir(), '.openagent', 'visualizations'),
    );
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'create_chart',
        description:
          'Auto-generate a chart from data. Supports: bar, line, pie, scatter, area, heatmap, ' +
          'radar, candlestick, histogram, treemap, boxplot, funnel. ' +
          'Data format varies by chart type. The chart is rendered via MCP-UI protocol.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of chart to create',
              enum: ['bar', 'line', 'pie', 'scatter', 'area', 'heatmap', 'radar', 'candlestick', 'histogram', 'treemap', 'boxplot', 'funnel'],
            },
            data: {
              type: 'object',
              description: 'Chart data. For bar/line: { labels: string[], datasets: [{ label, data: number[] }] }. For pie: { items: [{ label, value }] }. For scatter: { points: [{ x, y }] }.',
              additionalProperties: true,
            },
            options: {
              type: 'object',
              description: 'Chart options (title, colors, dimensions, etc.)',
              properties: {
                title: { type: 'string' },
                width: { type: 'integer' },
                height: { type: 'integer' },
                colors: { type: 'array', items: { type: 'string' } },
                legend: { type: 'boolean' },
                xLabel: { type: 'string' },
                yLabel: { type: 'string' },
              },
            },
          },
          required: ['type', 'data'],
        },
      },
      this.executeCreateChart.bind(this),
    );

    this.registerTool(
      {
        name: 'create_diagram',
        description:
          'Create a diagram from structured content. Supports: flowchart, mindmap, sequence, ' +
          'class, state, er (entity-relationship), gantt, pie, gitgraph. ' +
          'Uses Mermaid-compatible syntax for content definition.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of diagram to create',
              enum: ['flowchart', 'mindmap', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'gitgraph'],
            },
            content: {
              type: 'string',
              description: 'Diagram content in Mermaid syntax or structured format',
            },
            options: {
              type: 'object',
              description: 'Diagram options',
              properties: {
                title: { type: 'string' },
                direction: { type: 'string', enum: ['TD', 'LR', 'BT', 'RL'], default: 'TD' },
                theme: { type: 'string', enum: ['default', 'dark', 'forest', 'neutral'], default: 'default' },
                width: { type: 'integer' },
                height: { type: 'integer' },
              },
            },
          },
          required: ['type', 'content'],
        },
      },
      this.executeCreateDiagram.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Write,
        reason: 'Generates visualization files',
        resources: ['filesystem'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  // ─── Chart creation ────────────────────────────────────────────────────────

  private async executeCreateChart(args: Record<string, unknown>): Promise<ToolResult> {
    const chartType = args.type as ChartType;
    const data = args.data as ChartData;
    const options = (args.options as ChartOptions) || {};

    try {
      const chartConfig = this.buildChartConfig(chartType, data, options);
      const mcpUIPayload = this.generateMCPUIChart(chartConfig);

      // Save the chart config
      const filename = `chart_${Date.now()}.json`;
      const filePath = path.join(this.outputDir, filename);
      await fs.writeFile(filePath, JSON.stringify(mcpUIPayload, null, 2), 'utf-8');

      // Also generate a Mermaid representation if possible
      const mermaidRepresentation = this.chartToMermaid(chartType, data, options);

      return this.success(
        `Chart created: ${options.title || chartType} (${chartType})\n` +
        `File: ${filePath}\n\n` +
        `Mermaid representation:\n${mermaidRepresentation}`,
        {
          type: chartType,
          filePath,
          mcpUI: mcpUIPayload,
          mermaid: mermaidRepresentation,
        },
      );
    } catch (err) {
      return this.error(
        `Failed to create chart: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Diagram creation ──────────────────────────────────────────────────────

  private async executeCreateDiagram(args: Record<string, unknown>): Promise<ToolResult> {
    const diagramType = args.type as DiagramType;
    const content = args.content as string;
    const options = (args.options as Record<string, unknown>) || {};

    try {
      const mermaidCode = this.buildMermaidDiagram(diagramType, content, options);

      // Save the diagram
      const filename = `diagram_${Date.now()}.mmd`;
      const filePath = path.join(this.outputDir, filename);
      await fs.writeFile(filePath, mermaidCode, 'utf-8');

      // Generate MCP-UI payload
      const mcpUIPayload = {
        type: 'diagram',
        diagramType,
        mermaid: mermaidCode,
        options,
      };

      return this.success(
        `Diagram created: ${(options as Record<string, unknown>).title || diagramType}\n` +
        `File: ${filePath}\n\n` +
        `Mermaid code:\n${mermaidCode}`,
        {
          type: diagramType,
          filePath,
          mcpUI: mcpUIPayload,
          mermaid: mermaidCode,
        },
      );
    } catch (err) {
      return this.error(
        `Failed to create diagram: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Chart config builders ─────────────────────────────────────────────────

  private buildChartConfig(type: ChartType, data: ChartData, options: ChartOptions): Record<string, unknown> {
    const config: Record<string, unknown> = {
      type,
      data,
      options: {
        responsive: true,
        plugins: {
          title: {
            display: !!options.title,
            text: options.title || '',
          },
          legend: {
            display: options.legend !== false,
          },
        },
        ...(options.xLabel || options.yLabel
          ? {
              scales: {
                x: { title: { display: !!options.xLabel, text: options.xLabel || '' } },
                y: { title: { display: !!options.yLabel, text: options.yLabel || '' } },
              },
            }
          : {}),
      },
    };

    return config;
  }

  private generateMCPUIChart(config: Record<string, unknown>): Record<string, unknown> {
    // MCP-UI protocol payload structure
    return {
      protocol: 'mcp-ui',
      version: '1.0.0',
      type: 'chart',
      payload: config,
      render: {
        library: 'chart.js',
        version: '4.x',
      },
    };
  }

  /** Convert chart data to a Mermaid representation for text-based viewing */
  private chartToMermaid(type: ChartType, data: ChartData, options: ChartOptions): string {
    switch (type) {
      case 'pie': {
        const items = data.items || [];
        const title = options.title || 'Chart';
        const entries = items.map((item) => `  "${item.label}" : ${item.value}`).join('\n');
        return `pie title ${title}\n${entries}`;
      }

      case 'bar':
      case 'line': {
        const labels = data.labels || [];
        const datasets = data.datasets || [];
        const title = options.title || type;
        if (datasets.length === 0) return `%% ${title} - No data %%`;

        const rows = labels.map((label, idx) => {
          const values = datasets.map((ds) => ds.data[idx] ?? 0);
          return `${label} : ${values.join(' | ')}`;
        });

        return `%% ${title} (${type}) %%\n` +
          `%% Labels: ${labels.join(', ')} %%\n` +
          `%% Datasets: ${datasets.map((ds) => ds.label).join(', ')} %%\n` +
          rows.join('\n');
      }

      default:
        return `%% ${options.title || type} chart — visual rendering via MCP-UI %%`;
    }
  }

  // ─── Diagram builders ──────────────────────────────────────────────────────

  private buildMermaidDiagram(
    type: DiagramType,
    content: string,
    options: Record<string, unknown>,
  ): string {
    const direction = (options.direction as string) || 'TD';
    const theme = (options.theme as string) || 'default';

    // If content is already in Mermaid format, use it directly
    if (content.trim().startsWith(type) || content.trim().startsWith('graph') || content.trim().startsWith('sequenceDiagram')) {
      return content;
    }

    // Build Mermaid code from structured content
    switch (type) {
      case 'flowchart':
        return `flowchart ${direction}\n${this.indentContent(content)}`;

      case 'mindmap':
        return `mindmap\n  root((${options.title || 'Central Topic'}))\n${this.indentContent(content, 2)}`;

      case 'sequence':
        return `sequenceDiagram\n${this.indentContent(content)}`;

      case 'class':
        return `classDiagram\n${this.indentContent(content)}`;

      case 'state':
        return `stateDiagram-v2\n${this.indentContent(content)}`;

      case 'er':
        return `erDiagram\n${this.indentContent(content)}`;

      case 'gantt':
        return `gantt\n  title ${options.title || 'Gantt Chart'}\n${this.indentContent(content, 2)}`;

      case 'pie': {
        return `pie title ${options.title || 'Distribution'}\n${this.indentContent(content)}`;
      }

      case 'gitgraph':
        return `gitGraph\n${this.indentContent(content)}`;

      default:
        return `graph ${direction}\n${this.indentContent(content)}`;
    }
  }

  private indentContent(content: string, spaces: number = 2): string {
    const indent = ' '.repeat(spaces);
    return content
      .split('\n')
      .map((line) => (line.trim() ? indent + line : ''))
      .join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createAutoVisualiserExtension(): ExtensionConfig {
  return {
    id: 'auto_visualiser',
    type: ExtensionType.AutoVisualiser,
    name: 'Auto Visualiser',
    description: 'Generate charts and diagrams automatically via MCP-UI protocol',
    version: '1.0.0',
    enabled: false,
    settings: {
      outputDir: '',
      defaultTheme: 'default',
      chartLibrary: 'chart.js',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
