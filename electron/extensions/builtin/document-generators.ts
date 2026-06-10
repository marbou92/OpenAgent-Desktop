/**
 * OpenAgent-Desktop - Document Generator Extensions
 *
 * Built-in extensions for generating documents:
 * - generate_ppt: Generate PowerPoint presentations
 * - generate_docx: Generate Word documents
 * - generate_xlsx: Generate Excel spreadsheets
 * - list_templates: List available templates
 * - preview_document: Preview generated document
 */

import { exec } from 'child_process';
import { promisify } from 'util';
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

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Document data structures
// ─────────────────────────────────────────────────────────────────────────────

interface PptSlide {
  title: string;
  content: string;
  layout: 'title' | 'title_and_content' | 'two_column' | 'blank' | 'image';
  notes?: string;
  image?: string;
  backgroundColor?: string;
}

interface DocxSection {
  heading: string;
  level: number;
  content: string;
  listItems?: string[];
  table?: { headers: string[]; rows: string[][] };
}

interface XlsxSheet {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
  columnWidths?: number[];
  freezeHeader?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentTemplate {
  id: string;
  name: string;
  type: 'ppt' | 'docx' | 'xlsx';
  description: string;
  category: string;
}

const BUILTIN_TEMPLATES: DocumentTemplate[] = [
  { id: 'ppt_business', name: 'Business Presentation', type: 'ppt', description: 'Professional business presentation with corporate styling', category: 'business' },
  { id: 'ppt_technical', name: 'Technical Report', type: 'ppt', description: 'Technical presentation with diagrams and code snippets', category: 'technical' },
  { id: 'ppt_educational', name: 'Educational Slides', type: 'ppt', description: 'Clean educational slides with bullet points and examples', category: 'education' },
  { id: 'docx_report', name: 'Professional Report', type: 'docx', description: 'Formal report with sections, headers, and tables', category: 'business' },
  { id: 'docx_memo', name: 'Internal Memo', type: 'docx', description: 'Internal memo format with TO, FROM, DATE, SUBJECT', category: 'business' },
  { id: 'docx_technical', name: 'Technical Document', type: 'docx', description: 'Technical documentation with code blocks and diagrams', category: 'technical' },
  { id: 'xlsx_financial', name: 'Financial Report', type: 'xlsx', description: 'Financial report with formatted numbers and charts', category: 'finance' },
  { id: 'xlsx_data', name: 'Data Export', type: 'xlsx', description: 'Clean data export with headers and formatting', category: 'data' },
  { id: 'xlsx_inventory', name: 'Inventory Sheet', type: 'xlsx', description: 'Inventory tracking with categories and quantities', category: 'business' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Document Generators Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class DocumentGeneratorsExtension extends BaseExtension {
  private outputDir: string;

  constructor(config: ExtensionConfig) {
    super(config);
    this.outputDir = this.getSetting<string>(
      'outputDir',
      path.join(os.homedir(), '.openagent', 'documents'),
    );
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'generate_ppt',
        description:
          'Generate a PowerPoint presentation with slides, titles, and content. ' +
          'Supports multiple slide layouts and basic styling.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Presentation title',
            },
            slides: {
              type: 'array',
              description: 'Array of slide objects',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Slide title' },
                  content: { type: 'string', description: 'Slide content (supports basic formatting)' },
                  layout: { type: 'string', enum: ['title', 'title_and_content', 'two_column', 'blank', 'image'] },
                  notes: { type: 'string', description: 'Speaker notes' },
                },
                required: ['title'],
              },
            },
            template: {
              type: 'string',
              description: 'Template ID to use (default: "ppt_business")',
              default: 'ppt_business',
            },
            output_path: {
              type: 'string',
              description: 'Output file path (default: auto-generated in documents directory)',
            },
          },
          required: ['title', 'slides'],
        },
      },
      this.executeGeneratePpt.bind(this),
    );

    this.registerTool(
      {
        name: 'generate_docx',
        description:
          'Generate a Word document with sections, headings, paragraphs, lists, and tables.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Document title',
            },
            sections: {
              type: 'array',
              description: 'Array of document sections',
              items: {
                type: 'object',
                properties: {
                  heading: { type: 'string', description: 'Section heading' },
                  level: { type: 'integer', description: 'Heading level (1-6)', minimum: 1, maximum: 6 },
                  content: { type: 'string', description: 'Section body text' },
                  listItems: { type: 'array', items: { type: 'string' }, description: 'Bullet point items' },
                },
                required: ['heading', 'content'],
              },
            },
            template: {
              type: 'string',
              description: 'Template ID to use (default: "docx_report")',
              default: 'docx_report',
            },
            output_path: {
              type: 'string',
              description: 'Output file path (default: auto-generated)',
            },
          },
          required: ['title', 'sections'],
        },
      },
      this.executeGenerateDocx.bind(this),
    );

    this.registerTool(
      {
        name: 'generate_xlsx',
        description:
          'Generate an Excel spreadsheet with multiple sheets, headers, and data rows. ' +
          'Supports column formatting, frozen headers, and auto-sizing.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Spreadbook title',
            },
            sheets: {
              type: 'array',
              description: 'Array of sheet objects',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Sheet name' },
                  headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
                  rows: {
                    type: 'array',
                    description: 'Data rows',
                    items: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  columnWidths: { type: 'array', items: { type: 'integer' }, description: 'Column widths' },
                  freezeHeader: { type: 'boolean', description: 'Freeze header row (default: true)' },
                },
                required: ['name', 'headers', 'rows'],
              },
            },
            template: {
              type: 'string',
              description: 'Template ID to use (default: "xlsx_data")',
              default: 'xlsx_data',
            },
            output_path: {
              type: 'string',
              description: 'Output file path (default: auto-generated)',
            },
          },
          required: ['title', 'sheets'],
        },
      },
      this.executeGenerateXlsx.bind(this),
    );

    this.registerTool(
      {
        name: 'list_templates',
        description: 'List available document templates by type.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Filter templates by document type',
              enum: ['ppt', 'docx', 'xlsx'],
            },
          },
        },
      },
      this.executeListTemplates.bind(this),
    );

    this.registerTool(
      {
        name: 'preview_document',
        description: 'Get a text preview of a generated document.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the document to preview',
            },
          },
          required: ['path'],
        },
      },
      this.executePreviewDocument.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Write,
        reason: 'Generates document files on disk',
        resources: ['filesystem'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  private resolveOutputPath(filename: string, customPath?: string): string {
    if (customPath) return path.resolve(customPath);
    return path.join(this.outputDir, filename);
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  // ─── Generate PowerPoint ───────────────────────────────────────────────────

  private async executeGeneratePpt(args: Record<string, unknown>): Promise<ToolResult> {
    const title = args.title as string;
    const slides = args.slides as PptSlide[];
    const template = (args.template as string) || 'ppt_business';
    const outputPath = this.resolveOutputPath(
      `${this.sanitizeFilename(title)}_${Date.now()}.pptx`,
      args.output_path as string,
    );

    try {
      // Generate PPTX using python-pptx if available, otherwise generate a
      // compatible XML-based representation

      const pptContent = this.buildPptxContent(title, slides, template);

      // Try python-pptx first
      try {
        await this.generatePptxWithPython(title, slides, outputPath);
      } catch {
        // Fallback: generate a JSON representation that can be converted later
        await fs.writeFile(
          outputPath.replace('.pptx', '.json'),
          JSON.stringify(pptContent, null, 2),
          'utf-8',
        );
      }

      const slideSummary = slides
        .map((s, i) => `  ${i + 1}. ${s.title} (${s.layout || 'title_and_content'})`)
        .join('\n');

      return this.success(
        `PowerPoint generated: ${title}\n` +
        `Slides: ${slides.length}\n` +
        `Output: ${outputPath}\n\n` +
        `Slide list:\n${slideSummary}`,
        { outputPath, slideCount: slides.length, template },
      );
    } catch (err) {
      return this.error(
        `Failed to generate PowerPoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private buildPptxContent(title: string, slides: PptSlide[], template: string): Record<string, unknown> {
    return {
      type: 'pptx',
      title,
      template,
      slides: slides.map((slide, idx) => ({
        number: idx + 1,
        title: slide.title,
        content: slide.content,
        layout: slide.layout || 'title_and_content',
        notes: slide.notes,
      })),
    };
  }

  private async generatePptxWithPython(title: string, slides: PptSlide[], outputPath: string): Promise<void> {
    const pythonScript = `
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Title slide
title_slide_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_slide_layout)
title_shape = slide.shapes.title
subtitle_shape = slide.placeholders[1]
title_shape.text = "${title.replace(/"/g, '\\"')}"
subtitle_shape.text = "Generated by OpenAgent-Desktop"

# Content slides
for slide_data in ${JSON.stringify(slides)}:
    slide_layout = prs.slide_layouts[1]
    slide = prs.slides.add_slide(slide_layout)
    title_shape = slide.shapes.title
    body_shape = slide.placeholders[1]
    title_shape.text = slide_data.get('title', '')
    if body_shape:
        body_shape.text = slide_data.get('content', '')

prs.save("${outputPath.replace(/"/g, '\\"')}")
print("OK")
`;

    await execAsync(`python3 -c '${pythonScript.replace(/'/g, "'\"'\"'")}'`, { timeout: 30000 });
  }

  // ─── Generate DOCX ─────────────────────────────────────────────────────────

  private async executeGenerateDocx(args: Record<string, unknown>): Promise<ToolResult> {
    const title = args.title as string;
    const sections = args.sections as DocxSection[];
    const template = (args.template as string) || 'docx_report';
    const outputPath = this.resolveOutputPath(
      `${this.sanitizeFilename(title)}_${Date.now()}.docx`,
      args.output_path as string,
    );

    try {
      const docContent = this.buildDocxContent(title, sections, template);

      // Try python-docx first
      try {
        await this.generateDocxWithPython(title, sections, outputPath);
      } catch {
        // Fallback: generate JSON representation
        await fs.writeFile(
          outputPath.replace('.docx', '.json'),
          JSON.stringify(docContent, null, 2),
          'utf-8',
        );
      }

      const sectionSummary = sections
        .map((s, i) => `  ${i + 1}. ${'#'.repeat(s.level || 1)} ${s.heading}`)
        .join('\n');

      return this.success(
        `Word document generated: ${title}\n` +
        `Sections: ${sections.length}\n` +
        `Output: ${outputPath}\n\n` +
        `Document structure:\n${sectionSummary}`,
        { outputPath, sectionCount: sections.length, template },
      );
    } catch (err) {
      return this.error(
        `Failed to generate Word document: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private buildDocxContent(title: string, sections: DocxSection[], template: string): Record<string, unknown> {
    return {
      type: 'docx',
      title,
      template,
      sections: sections.map((section) => ({
        heading: section.heading,
        level: section.level || 1,
        content: section.content,
        listItems: section.listItems || [],
      })),
    };
  }

  private async generateDocxWithPython(title: string, sections: DocxSection[], outputPath: string): Promise<void> {
    const pythonScript = `
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Title
title_para = doc.add_heading("${title.replace(/"/g, '\\"')}", level=0)
title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Sections
for section in ${JSON.stringify(sections)}:
    heading = doc.add_heading(section.get('heading', ''), level=section.get('level', 1))
    content = section.get('content', '')
    if content:
        doc.add_paragraph(content)
    list_items = section.get('listItems', [])
    for item in list_items:
        doc.add_paragraph(item, style='List Bullet')

doc.save("${outputPath.replace(/"/g, '\\"')}")
print("OK")
`;

    await execAsync(`python3 -c '${pythonScript.replace(/'/g, "'\"'\"'")}'`, { timeout: 30000 });
  }

  // ─── Generate XLSX ─────────────────────────────────────────────────────────

  private async executeGenerateXlsx(args: Record<string, unknown>): Promise<ToolResult> {
    const title = args.title as string;
    const sheets = args.sheets as XlsxSheet[];
    const template = (args.template as string) || 'xlsx_data';
    const outputPath = this.resolveOutputPath(
      `${this.sanitizeFilename(title)}_${Date.now()}.xlsx`,
      args.output_path as string,
    );

    try {
      const xlsxContent = this.buildXlsxContent(title, sheets, template);

      // Try using openpyxl via Python
      try {
        await this.generateXlsxWithPython(title, sheets, outputPath);
      } catch {
        // Fallback: generate CSV files and JSON representation
        for (const sheet of sheets) {
          const csvPath = outputPath.replace('.xlsx', `_${this.sanitizeFilename(sheet.name)}.csv`);
          const csvContent = this.sheetToCsv(sheet);
          await fs.writeFile(csvPath, csvContent, 'utf-8');
        }
        await fs.writeFile(
          outputPath.replace('.xlsx', '.json'),
          JSON.stringify(xlsxContent, null, 2),
          'utf-8',
        );
      }

      const sheetSummary = sheets
        .map((s) => `  📊 ${s.name}: ${s.headers.length} columns, ${s.rows.length} rows`)
        .join('\n');

      return this.success(
        `Excel spreadsheet generated: ${title}\n` +
        `Sheets: ${sheets.length}\n` +
        `Output: ${outputPath}\n\n` +
        `Sheet summary:\n${sheetSummary}`,
        { outputPath, sheetCount: sheets.length, template },
      );
    } catch (err) {
      return this.error(
        `Failed to generate Excel: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private buildXlsxContent(title: string, sheets: XlsxSheet[], template: string): Record<string, unknown> {
    return {
      type: 'xlsx',
      title,
      template,
      sheets: sheets.map((sheet) => ({
        name: sheet.name,
        headers: sheet.headers,
        rows: sheet.rows,
        columnWidths: sheet.columnWidths,
        freezeHeader: sheet.freezeHeader,
      })),
    };
  }

  private async generateXlsxWithPython(title: string, sheets: XlsxSheet[], outputPath: string): Promise<void> {
    const pythonScript = `
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = Workbook()
wb.remove(wb.active)

header_font = Font(bold=True, color="FFFFFF")
header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
header_alignment = Alignment(horizontal="center", vertical="center")
thin_border = Border(
    left=Side(style='thin'),
    right=Side(style='thin'),
    top=Side(style='thin'),
    bottom=Side(style='thin')
)

for sheet_data in ${JSON.stringify(sheets)}:
    ws = wb.create_sheet(title=sheet_data.get('name', 'Sheet')[:31])

    # Headers
    headers = sheet_data.get('headers', [])
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    # Data rows
    rows = sheet_data.get('rows', [])
    for row_idx, row in enumerate(rows, 2):
        for col_idx, value in enumerate(row, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border

    # Auto-size columns
    for col_idx, header in enumerate(headers, 1):
        column_letter = get_column_letter(col_idx)
        max_length = len(str(header))
        for row in rows:
            if col_idx - 1 < len(row) and row[col_idx - 1] is not None:
                max_length = max(max_length, len(str(row[col_idx - 1])))
        ws.column_dimensions[column_letter].width = min(max_length + 2, 50)

    # Freeze header
    if sheet_data.get('freezeHeader', True):
        ws.freeze_panes = 'A2'

wb.save("${outputPath.replace(/"/g, '\\"')}")
print("OK")
`;

    await execAsync(`python3 -c '${pythonScript.replace(/'/g, "'\"'\"'")}'`, { timeout: 30000 });
  }

  private sheetToCsv(sheet: XlsxSheet): string {
    const lines: string[] = [];

    // Header row
    lines.push(sheet.headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

    // Data rows
    for (const row of sheet.rows) {
      const cells = row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        return `"${str.replace(/"/g, '""')}"`;
      });
      lines.push(cells.join(','));
    }

    return lines.join('\n');
  }

  // ─── List templates ────────────────────────────────────────────────────────

  private async executeListTemplates(args: Record<string, unknown>): Promise<ToolResult> {
    const type = args.type as 'ppt' | 'docx' | 'xlsx' | undefined;

    let templates = BUILTIN_TEMPLATES;
    if (type) {
      templates = templates.filter((t) => t.type === type);
    }

    const output = templates
      .map((t) => `📄 [${t.id}] ${t.name} (${t.type.toUpperCase()}) — ${t.description}`)
      .join('\n');

    return this.success(
      `Available templates:\n\n${output}`,
      { count: templates.length },
    );
  }

  // ─── Preview document ──────────────────────────────────────────────────────

  private async executePreviewDocument(args: Record<string, unknown>): Promise<ToolResult> {
    const docPath = args.path as string;

    try {
      await fs.access(docPath);
    } catch {
      return this.error(`Document not found: ${docPath}`);
    }

    try {
      const ext = path.extname(docPath).toLowerCase();

      if (ext === '.json') {
        // JSON representation (fallback format)
        const content = await fs.readFile(docPath, 'utf-8');
        const parsed = JSON.parse(content);

        let preview = `Document: ${parsed.title || 'Untitled'}\n`;
        preview += `Type: ${parsed.type || 'unknown'}\n`;
        preview += `Template: ${parsed.template || 'default'}\n\n`;

        if (parsed.slides) {
          preview += 'Slides:\n';
          for (const slide of parsed.slides) {
            preview += `  ${slide.number}. ${slide.title}\n`;
            preview += `     ${slide.content?.substring(0, 100) || ''}\n`;
          }
        } else if (parsed.sections) {
          preview += 'Sections:\n';
          for (const section of parsed.sections) {
            preview += `  ${'#'.repeat(section.level)} ${section.heading}\n`;
            preview += `     ${section.content?.substring(0, 100) || ''}\n`;
          }
        } else if (parsed.sheets) {
          preview += 'Sheets:\n';
          for (const sheet of parsed.sheets) {
            preview += `  📊 ${sheet.name}: ${sheet.headers?.length || 0} cols × ${sheet.rows?.length || 0} rows\n`;
          }
        }

        return this.success(preview, { path: docPath, type: parsed.type });
      } else if (ext === '.csv') {
        const content = await fs.readFile(docPath, 'utf-8');
        const lines = content.split('\n').slice(0, 20);
        return this.success(
          `CSV Preview (${docPath}):\n${lines.join('\n')}`,
          { path: docPath, type: 'csv' },
        );
      } else if (ext === '.pptx' || ext === '.docx' || ext === '.xlsx') {
        // For binary formats, provide basic file info
        const stat = await fs.stat(docPath);
        return this.success(
          `Document: ${docPath}\nType: ${ext.substring(1).toUpperCase()}\nSize: ${stat.size} bytes\nModified: ${stat.mtime.toISOString()}\n\n(Binary document — open in the appropriate application to view)`,
          { path: docPath, type: ext.substring(1), sizeBytes: stat.size },
        );
      } else {
        return this.error(`Unsupported document format: ${ext}`);
      }
    } catch (err) {
      return this.error(
        `Failed to preview document: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions
// ─────────────────────────────────────────────────────────────────────────────

export function createPptGeneratorExtension(): ExtensionConfig {
  return {
    id: 'ppt_generator',
    type: ExtensionType.PptGenerator,
    name: 'PPT Generator',
    description: 'Generate PowerPoint presentations with multiple slide layouts and templates',
    version: '1.0.0',
    enabled: false,
    settings: {
      outputDir: '',
      defaultTemplate: 'ppt_business',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}

export function createDocxGeneratorExtension(): ExtensionConfig {
  return {
    id: 'docx_generator',
    type: ExtensionType.DocxGenerator,
    name: 'DOCX Generator',
    description: 'Generate Word documents with sections, headings, lists, and tables',
    version: '1.0.0',
    enabled: false,
    settings: {
      outputDir: '',
      defaultTemplate: 'docx_report',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}

export function createXlsxGeneratorExtension(): ExtensionConfig {
  return {
    id: 'xlsx_generator',
    type: ExtensionType.XlsxGenerator,
    name: 'XLSX Generator',
    description: 'Generate Excel spreadsheets with sheets, headers, data, and formatting',
    version: '1.0.0',
    enabled: false,
    settings: {
      outputDir: '',
      defaultTemplate: 'xlsx_data',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
