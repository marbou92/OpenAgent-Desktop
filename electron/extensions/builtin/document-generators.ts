/**
 * OpenAgent-Desktop - Document Generator Extensions
 *
 * Built-in extensions for generating REAL, openable documents:
 * - generate_ppt:  Generate PowerPoint presentations  (.pptx)
 * - generate_docx: Generate Word documents            (.docx)
 * - generate_xlsx: Generate Excel spreadsheets         (.xlsx)
 * - list_templates: List available templates
 * - preview_document: Preview generated document
 *
 * All generators produce valid Office Open XML files (ZIP of XML)
 * using only Node.js built-in modules — no external npm packages needed.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
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
// Pure TypeScript ZIP Builder
//
// Creates a valid ZIP file using Node's built-in zlib for DEFLATE compression.
// No external npm dependencies required.
// ─────────────────────────────────────────────────────────────────────────────

class ZipBuilder {
  private entries: Array<{
    path: string;
    data: Buffer;
  }> = [];

  /** Add a text file to the ZIP archive (UTF-8 encoded) */
  addFile(filePath: string, content: string): void {
    this.entries.push({
      path: filePath,
      data: Buffer.from(content, 'utf-8'),
    });
  }

  /** Add a binary file to the ZIP archive */
  addBuffer(filePath: string, data: Buffer): void {
    this.entries.push({ path: filePath, data });
  }

  /**
   * Build the ZIP file and return it as a Buffer.
   *
   * ZIP format layout:
   *   [Local file header + file data] × N
   *   [Central directory entry] × N
   *   [End of central directory record]
   *
   * We use DEFLATE (method 8) for compressible content and STORE (method 0)
   * for very small entries where compression overhead isn't worth it.
   */
  toBuffer(): Buffer {
    const localHeaders: Buffer[] = [];
    const centralEntries: Buffer[] = [];
    let offset = 0;

    for (const entry of this.entries) {
      const pathBytes = Buffer.from(entry.path, 'utf-8');
      const crc = crc32(entry.data);

      // Decide compression method: STORE for tiny files, DEFLATE otherwise
      const useDeflate = entry.data.length > 64;
      let compressedData: Buffer;
      let method: number;

      if (useDeflate) {
        compressedData = zlib.deflateRawSync(entry.data, { level: 6 });
        method = 8; // DEFLATE
      } else {
        compressedData = entry.data;
        method = 0; // STORE
      }

      // ── Local file header (30 bytes + filename) ──
      const localHeader = Buffer.alloc(30 + pathBytes.length);
      localHeader.writeUInt32LE(0x04034b50, 0);   // Local file header signature
      localHeader.writeUInt16LE(20, 4);             // Version needed to extract (2.0)
      localHeader.writeUInt16LE(0, 6);              // General purpose bit flag
      localHeader.writeUInt16LE(method, 8);          // Compression method
      localHeader.writeUInt16LE(0, 10);              // File last mod time
      localHeader.writeUInt16LE(0x0021, 12);         // File last mod date (any valid date)
      localHeader.writeUInt32LE(crc, 14);            // CRC-32
      localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
      localHeader.writeUInt32LE(entry.data.length, 22);     // Uncompressed size
      localHeader.writeUInt16LE(pathBytes.length, 26);      // File name length
      localHeader.writeUInt16LE(0, 28);              // Extra field length
      pathBytes.copy(localHeader, 30);

      localHeaders.push(localHeader);
      localHeaders.push(compressedData);

      // ── Central directory entry (46 bytes + filename) ──
      const centralEntry = Buffer.alloc(46 + pathBytes.length);
      centralEntry.writeUInt32LE(0x02014b50, 0);    // Central dir signature
      centralEntry.writeUInt16LE(20, 4);             // Version made by
      centralEntry.writeUInt16LE(20, 6);             // Version needed to extract
      centralEntry.writeUInt16LE(0, 8);              // General purpose bit flag
      centralEntry.writeUInt16LE(method, 10);         // Compression method
      centralEntry.writeUInt16LE(0, 12);              // File last mod time
      centralEntry.writeUInt16LE(0x0021, 14);         // File last mod date
      centralEntry.writeUInt32LE(crc, 16);            // CRC-32
      centralEntry.writeUInt32LE(compressedData.length, 20); // Compressed size
      centralEntry.writeUInt32LE(entry.data.length, 24);     // Uncompressed size
      centralEntry.writeUInt16LE(pathBytes.length, 28);      // File name length
      centralEntry.writeUInt16LE(0, 30);              // Extra field length
      centralEntry.writeUInt16LE(0, 32);              // File comment length
      centralEntry.writeUInt16LE(0, 34);              // Disk number start
      centralEntry.writeUInt16LE(0, 36);              // Internal file attributes
      centralEntry.writeUInt32LE(0, 38);              // External file attributes
      centralEntry.writeUInt32LE(offset, 42);         // Relative offset of local header
      pathBytes.copy(centralEntry, 46);

      centralEntries.push(centralEntry);

      offset += localHeader.length + compressedData.length;
    }

    // ── End of central directory record (22 bytes) ──
    const centralDirSize = centralEntries.reduce((sum, b) => sum + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);              // EOCD signature
    eocd.writeUInt16LE(0, 4);                        // Disk number
    eocd.writeUInt16LE(0, 6);                        // Disk with central dir
    eocd.writeUInt16LE(this.entries.length, 8);      // Entries on this disk
    eocd.writeUInt16LE(this.entries.length, 10);     // Total entries
    eocd.writeUInt32LE(centralDirSize, 12);          // Central dir size
    eocd.writeUInt32LE(offset, 16);                  // Central dir offset
    eocd.writeUInt16LE(0, 20);                       // Comment length

    return Buffer.concat([...localHeaders, ...centralEntries, eocd]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRC-32 implementation (ISO 3309 / ITU-T V.42)
// Needed for ZIP file integrity checks.
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// XML helper — escapes text for safe embedding in XML content
// ─────────────────────────────────────────────────────────────────────────────

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─────────────────────────────────────────────────────────────────────────────
// PPTX Generator — creates a valid PowerPoint Open XML file
// ─────────────────────────────────────────────────────────────────────────────

function generatePptx(title: string, slides: PptSlide[], _template: string): Buffer {
  const zip = new ZipBuilder();
  const slideCount = slides.length;

  // ── [Content_Types].xml ──
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slides.map((_, i) => `  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n')}
${slides.some(s => s.notes) ? slides.filter(s => s.notes).map((_, idx) => `  <Override PartName="/ppt/notesSlides/notesSlide${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join('\n') : ''}
</Types>`;

  zip.addFile('[Content_Types].xml', contentTypes);

  // ── _rels/.rels ──
  zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  // ── ppt/presentation.xml ──
  const slideIdList = slides.map((_, i) => {
    const id = 256 + i;
    return `<p:sldId id="${id}" r:id="rId${i + 2}"/>`;
  }).join('\n      ');

  zip.addFile('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    ${slideIdList}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

  // ── ppt/_rels/presentation.xml.rels ──
  const slideRels = slides.map((_, i) =>
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('\n  ');

  zip.addFile('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`);

  // ── ppt/slideMasters/slideMaster1.xml ──
  zip.addFile('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgRef idx="1001">
        <a:schemeClr val="bg1"/>
      </p:bgRef>
    </p:bg>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
    <p:sldLayoutId id="2147483650" r:id="rId2"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`);

  // ── ppt/slideMasters/_rels/slideMaster1.xml.rels ──
  zip.addFile('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);

  // ── ppt/slideLayouts/slideLayout1.xml (title layout) ──
  zip.addFile('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title" preserve="1">
  <p:cSld name="Title Slide">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1597819"/><a:ext cx="10820400" cy="3535693"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="1143000" y="4604719"/><a:ext cx="9998138" cy="1600200"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="2000"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sldLayout>`);

  // ── ppt/slideLayouts/slideLayout2.xml (title and content layout) ──
  zip.addFile('ppt/slideLayouts/slideLayout2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj" preserve="1">
  <p:cSld name="Title and Content">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="8229600" cy="4525963"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1800"/></a:lvl1pPr><a:lvl2pPr marL="457200" algn="l"><a:defRPr sz="1800"/></a:lvl2pPr><a:lvl3pPr marL="914400" algn="l"><a:defRPr sz="1800"/></a:lvl3pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sldLayout>`);

  // ── ppt/slideLayouts/_rels/slideLayout1.xml.rels ──
  zip.addFile('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

  zip.addFile('ppt/slideLayouts/_rels/slideLayout2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

  // ── ppt/theme/theme1.xml ──
  zip.addFile('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`);

  // ── Individual slides ──
  for (let i = 0; i < slideCount; i++) {
    const slide = slides[i];
    const isTitleSlide = slide.layout === 'title' || i === 0;
    const layoutTarget = isTitleSlide ? '../slideLayouts/slideLayout1.xml' : '../slideLayouts/slideLayout2.xml';

    let slideXml: string;

    if (isTitleSlide) {
      // Title slide — centered title + subtitle
      slideXml = buildTitleSlideXml(slide.title, slide.content);
    } else {
      // Content slide — title + bullet-pointed body
      slideXml = buildContentSlideXml(slide.title, slide.content, slide.backgroundColor);
    }

    zip.addFile(`ppt/slides/slide${i + 1}.xml`, slideXml);

    zip.addFile(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="${layoutTarget}"/>
  ${slide.notes ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>` : ''}
</Relationships>`);

    // Speaker notes
    if (slide.notes) {
      zip.addFile(`ppt/notesSlides/notesSlide${i + 1}.xml`, buildNotesSlideXml(slide.notes, i + 1));
      zip.addFile(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${i + 1}.xml"/>
</Relationships>`);
    }
  }

  return zip.toBuffer();
}

function buildTitleSlideXml(title: string, subtitle: string): string {
  const titleLines = title.split('\n');
  const titleRuns = titleLines.map(line =>
    `<a:r><a:rPr lang="en-US" sz="4400" b="1" dirty="0"/><a:t>${xmlEscape(line)}</a:t></a:r>`
  ).join('');

  const subLines = subtitle.split('\n');
  const subRuns = subLines.map(line =>
    `<a:r><a:rPr lang="en-US" sz="2000" dirty="0"/><a:t>${xmlEscape(line)}</a:t></a:r>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1597819"/><a:ext cx="10820400" cy="3535693"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></a:lstStyle><a:p>${titleRuns}</a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="1143000" y="4604719"/><a:ext cx="9998138" cy="1600200"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="2000"/></a:lvl1pPr></a:lstStyle><a:p>${subRuns}</a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sld>`;
}

function buildContentSlideXml(title: string, content: string, bgColor?: string): string {
  const titleLines = title.split('\n');
  const titleRuns = titleLines.map(line =>
    `<a:r><a:rPr lang="en-US" sz="2800" b="1" dirty="0"/><a:t>${xmlEscape(line)}</a:t></a:r>`
  ).join('');

  // Parse content into bullet points
  const contentLines = content.split('\n').filter(l => l.trim().length > 0);
  const bodyParagraphs = contentLines.map(line => {
    const trimmed = line.trim();
    // Detect indent level (leading spaces or tabs)
    let level = 0;
    const match = trimmed.match(/^(\s*)/);
    if (match) {
      level = Math.min(Math.floor(match[1].length / 2), 4);
    }
    // Strip leading bullet characters
    const text = trimmed.replace(/^\s*[-*•]\s*/, '');
    const marL = level * 457200;
    const indent = -457200;
    return `<a:p>
      <a:pPr marL="${marL}" indent="${indent}" lvl="${level}"><a:buChar char="•"/></a:pPr>
      <a:r><a:rPr lang="en-US" sz="1800" dirty="0" lvl="${level}"/><a:t>${xmlEscape(text)}</a:t></a:r>
    </a:p>`;
  }).join('\n      ');

  const bgXml = bgColor
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor.replace('#', '')}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    ${bgXml}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p>${titleRuns}</a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="8229600" cy="4525963"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle>
            <a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1800"/></a:lvl1pPr>
            <a:lvl2pPr marL="457200" algn="l"><a:defRPr sz="1600"/></a:lvl2pPr>
            <a:lvl3pPr marL="914400" algn="l"><a:defRPr sz="1400"/></a:lvl3pPr>
            <a:lvl4pPr marL="1371600" algn="l"><a:defRPr sz="1200"/></a:lvl4pPr>
          </a:lstStyle>
          ${bodyParagraphs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sld>`;
}

function buildNotesSlideXml(notes: string, slideIndex: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm></p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${xmlEscape(notes)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX Generator — creates a valid Word Open XML file
// ─────────────────────────────────────────────────────────────────────────────

function generateDocx(title: string, sections: DocxSection[], _template: string): Buffer {
  const zip = new ZipBuilder();

  // ── [Content_Types].xml ──
  zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  // ── _rels/.rels ──
  zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  // ── word/_rels/document.xml.rels ──
  zip.addFile('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
</Relationships>`);

  // ── word/document.xml — the main document content ──
  const bodyParts: string[] = [];

  // Document title (Heading 0 / Title style)
  bodyParts.push(`<w:p>
  <w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr>
  <w:r><w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r>
</w:p>`);

  // Blank line after title
  bodyParts.push(`<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`);

  for (const section of sections) {
    const level = Math.min(Math.max(section.level || 1, 1), 6);

    // Heading
    const headingStyleMap: Record<number, string> = {
      1: 'Heading1', 2: 'Heading2', 3: 'Heading3',
      4: 'Heading4', 5: 'Heading5', 6: 'Heading6',
    };
    const headingStyle = headingStyleMap[level] || 'Heading1';
    const headingSizeMap: Record<number, string> = {
      1: '32', 2: '28', 3: '24', 4: '22', 5: '20', 6: '18',
    };
    const headingSize = headingSizeMap[level] || '32';

    bodyParts.push(`<w:p>
  <w:pPr><w:pStyle w:val="${headingStyle}"/></w:pPr>
  <w:r><w:rPr><w:b/><w:sz w:val="${headingSize}"/><w:szCs w:val="${headingSize}"/><w:color w:val="2E74B5"/></w:rPr><w:t>${xmlEscape(section.heading)}</w:t></w:r>
</w:p>`);

    // Body content — parse for **bold** and *italic*
    if (section.content) {
      const paragraphs = section.content.split('\n');
      for (const para of paragraphs) {
        if (para.trim().length === 0) {
          bodyParts.push(`<w:p/>`);
          continue;
        }
        const runs = parseFormattedText(para);
        bodyParts.push(`<w:p>${runs}</w:p>`);
      }
    }

    // Bullet list items
    if (section.listItems && section.listItems.length > 0) {
      for (const item of section.listItems) {
        const runs = parseFormattedText(item);
        bodyParts.push(`<w:p>
  <w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>
  ${runs}
</w:p>`);
      }
    }

    // Table
    if (section.table) {
      const tbl = section.table;
      const colCount = tbl.headers.length;

      let tblXml = `<w:tbl>
  <w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>
    </w:tblBorders>
    <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
  </w:tblPr>
  <w:tblGrid>${'  <w:gridCol w:w="2500"/>'.repeat(colCount)}</w:tblGrid>`;

      // Header row
      tblXml += `<w:tr>
  <w:trPr><w:tblHeader/></w:trPr>`;
      for (const header of tbl.headers) {
        tblXml += `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="2E74B5"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr><w:t>${xmlEscape(header)}</w:t></w:r></w:p></w:tc>`;
      }
      tblXml += `</w:tr>`;

      // Data rows
      for (const row of tbl.rows) {
        tblXml += `<w:tr>`;
        for (let c = 0; c < colCount; c++) {
          const cellVal = c < row.length ? row[c] : '';
          tblXml += `<w:tc><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${xmlEscape(cellVal)}</w:t></w:r></w:p></w:tc>`;
        }
        tblXml += `</w:tr>`;
      }

      tblXml += `</w:tbl>`;
      bodyParts.push(tblXml);
    }

    // Add spacing between sections
    bodyParts.push(`<w:p/>`);
  }

  zip.addFile('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" mc:Ignorable="wpc wpv">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  // ── word/styles.xml ──
  zip.addFile('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="20"/><w:outlineLvl w:val="4"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="100" w:after="10"/><w:outlineLvl w:val="5"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="40"/><w:ind w:left="720" w:hanging="360"/></w:pPr>
    <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>
    </w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`);

  // ── word/settings.xml ──
  zip.addFile('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="compressPunctuation"/>
</w:settings>`);

  // ── word/webSettings.xml ──
  zip.addFile('word/webSettings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:optimizeForBrowser/>
</w:webSettings>`);

  // ── word/fontTable.xml ──
  zip.addFile('word/fontTable.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Calibri"><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>
  <w:font w:name="Calibri Light"><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>
  <w:font w:name="Times New Roman"><w:charset w:val="00"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>
</w:fonts>`);

  // ── docProps/core.xml ──
  const now = new Date().toISOString();
  zip.addFile('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>OpenAgent-Desktop</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);

  // ── docProps/app.xml ──
  zip.addFile('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>OpenAgent-Desktop</Application>
  <AppVersion>1.0</AppVersion>
</Properties>`);

  return zip.toBuffer();
}

/**
 * Parse text with **bold** and *italic* markdown-style formatting into OOXML runs.
 */
function parseFormattedText(text: string): string {
  const runs: string[] = [];
  // Match **bold**, *italic*, or plain text
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|[^*]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // Bold
      runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(match[2])}</w:t></w:r>`);
    } else if (match[3]) {
      // Italic
      runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(match[3])}</w:t></w:r>`);
    } else {
      // Plain text
      runs.push(`<w:r><w:t xml:space="preserve">${xmlEscape(match[1])}</w:t></w:r>`);
    }
  }
  return runs.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX Generator — creates a valid Excel Open XML file
// ─────────────────────────────────────────────────────────────────────────────

function generateXlsx(title: string, sheets: XlsxSheet[], _template: string): Buffer {
  const zip = new ZipBuilder();

  // Collect all unique strings for the shared strings table
  const sharedStrings: string[] = [];
  const sharedStringIndex = new Map<string, number>();

  function getSharedStringIndex(s: string): number {
    if (sharedStringIndex.has(s)) return sharedStringIndex.get(s)!;
    const idx = sharedStrings.length;
    sharedStrings.push(s);
    sharedStringIndex.set(s, idx);
    return idx;
  }

  // Pre-process: identify all string cells and add to shared strings
  for (const sheet of sheets) {
    for (const header of sheet.headers) {
      getSharedStringIndex(header);
    }
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (typeof cell === 'string') {
          getSharedStringIndex(cell);
        }
      }
    }
  }

  // ── [Content_Types].xml ──
  const sheetOverrides = sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('\n');

  zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheetOverrides}
</Types>`);

  // ── _rels/.rels ──
  zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  // ── xl/workbook.xml ──
  const sheetEntries = sheets.map((s, i) => {
    const name = xmlEscape(s.name.substring(0, 31)); // Excel limits sheet names to 31 chars
    return `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  }).join('\n    ');

  zip.addFile('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetEntries}
  </sheets>
</workbook>`);

  // ── xl/_rels/workbook.xml.rels ──
  const sheetRels = sheets.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('\n  ');

  zip.addFile('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rIdStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${sheetRels}
</Relationships>`);

  // ── xl/styles.xml ──
  // Style 0 = default, Style 1 = header bold, Style 2 = date format
  zip.addFile('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`);

  // ── xl/sharedStrings.xml ──
  const ssEntries = sharedStrings.map(s =>
    `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`
  ).join('\n    ');

  zip.addFile('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
    ${ssEntries}
</sst>`);

  // ── Individual worksheets ──
  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si];
    const rows: string[] = [];

    // Header row (style 1 = bold + blue fill + borders)
    const headerCells = sheet.headers.map((h, ci) => {
      const colLetter = columnLetter(ci);
      const ssi = getSharedStringIndex(h);
      return `<c r="${colLetter}1" s="1" t="s"><v>${ssi}</v></c>`;
    });
    rows.push(`<row r="1">${headerCells.join('')}</row>`);

    // Data rows (style 2 = thin borders)
    for (let ri = 0; ri < sheet.rows.length; ri++) {
      const row = sheet.rows[ri];
      const rowNum = ri + 2; // 1-indexed, plus header row
      const cells = row.map((cell, ci) => {
        const colLetter = columnLetter(ci);
        if (cell === null || cell === undefined) {
          return `<c r="${colLetter}${rowNum}" s="2"/>`;
        } else if (typeof cell === 'number') {
          return `<c r="${colLetter}${rowNum}" s="2"><v>${cell}</v></c>`;
        } else if (typeof cell === 'boolean') {
          return `<c r="${colLetter}${rowNum}" s="2" t="b"><v>${cell ? 1 : 0}</v></c>`;
        } else {
          // Check if it looks like a date (ISO format)
          const str = String(cell);
          const dateMatch = str.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/);
          if (dateMatch) {
            // Convert to Excel date serial number
            const dateVal = new Date(str);
            const excelDate = dateToExcelSerial(dateVal);
            return `<c r="${colLetter}${rowNum}" s="3"><v>${excelDate}</v></c>`;
          }
          const ssi = getSharedStringIndex(str);
          return `<c r="${colLetter}${rowNum}" s="2" t="s"><v>${ssi}</v></c>`;
        }
      });
      rows.push(`<row r="${rowNum}">${cells.join('')}</row>`);
    }

    // Column widths
    let colsXml = '';
    if (sheet.columnWidths && sheet.columnWidths.length > 0) {
      const colEls = sheet.columnWidths.map((w, ci) => {
        const min = ci + 1;
        const max = ci + 1;
        return `<col min="${min}" max="${max}" width="${w}" customWidth="1"/>`;
      }).join('');
      colsXml = `<cols>${colEls}</cols>`;
    } else {
      // Auto-calculate column widths from headers and data
      const widths = sheet.headers.map((h, ci) => {
        let maxLen = h.length;
        for (const row of sheet.rows) {
          if (ci < row.length && row[ci] !== null && row[ci] !== undefined) {
            maxLen = Math.max(maxLen, String(row[ci]).length);
          }
        }
        // Approx width: ~1.3 per character, min 8, max 50
        return Math.min(Math.max(Math.ceil(maxLen * 1.3), 8), 50);
      });
      const colEls = widths.map((w, ci) => {
        const min = ci + 1;
        const max = ci + 1;
        return `<col min="${min}" max="${max}" width="${w}" customWidth="1"/>`;
      }).join('');
      colsXml = `<cols>${colEls}</cols>`;
    }

    // Freeze panes (freeze header row)
    const freezeXml = sheet.freezeHeader !== false
      ? `<sheetViews><sheetView tabSelected="${si === 0 ? 1 : 0}" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView tabSelected="${si === 0 ? 1 : 0}" workbookViewId="0"/></sheetViews>`;

    zip.addFile(`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${freezeXml}
  ${colsXml}
  <sheetData>
    ${rows.join('\n    ')}
  </sheetData>
</worksheet>`);
  }

  return zip.toBuffer();
}

/** Convert a zero-based column index to an Excel column letter (0→A, 25→Z, 26→AA, etc.) */
function columnLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/** Convert a JS Date to an Excel serial number (days since 1899-12-30, with the Lotus 1-2-3 bug) */
function dateToExcelSerial(date: Date): number {
  const epoch = new Date(1899, 11, 30); // 1899-12-30
  const diffMs = date.getTime() - epoch.getTime();
  const days = diffMs / (86400000);
  // Lotus 1-2-3 bug: Excel treats 1900-02-29 as a valid date
  if (days > 59) return days + 1;
  return days;
}

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
          'Generate a PowerPoint presentation (.pptx) with slides, titles, and content. ' +
          'Creates a real, openable PPTX file using Office Open XML format. ' +
          'Supports title slides, content slides with bullet points, speaker notes, and custom background colors.',
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
                  content: { type: 'string', description: 'Slide content — use newlines for separate bullet points, leading spaces for indentation' },
                  layout: { type: 'string', enum: ['title', 'title_and_content', 'two_column', 'blank', 'image'], description: 'Slide layout (default: first slide is "title", rest are "title_and_content")' },
                  notes: { type: 'string', description: 'Speaker notes' },
                  backgroundColor: { type: 'string', description: 'Background color as hex (e.g. "#003366")' },
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
          'Generate a Word document (.docx) with sections, headings, paragraphs, lists, and tables. ' +
          'Creates a real, openable DOCX file using Office Open XML format. ' +
          'Supports **bold** and *italic* text formatting, bullet lists, and styled tables.',
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
                  content: { type: 'string', description: 'Section body text (supports **bold** and *italic* markdown formatting)' },
                  listItems: { type: 'array', items: { type: 'string' }, description: 'Bullet point items' },
                  table: {
                    type: 'object',
                    description: 'Table data',
                    properties: {
                      headers: { type: 'array', items: { type: 'string' }, description: 'Table header row' },
                      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table data rows' },
                    },
                    required: ['headers', 'rows'],
                  },
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
          'Generate an Excel spreadsheet (.xlsx) with multiple sheets, headers, and data rows. ' +
          'Creates a real, openable XLSX file using Office Open XML format. ' +
          'Supports number/string/boolean/date cell types, frozen headers, and auto-sized columns.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Spreadsheet title',
            },
            sheets: {
              type: 'array',
              description: 'Array of sheet objects',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Sheet name (max 31 characters)' },
                  headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
                  rows: {
                    type: 'array',
                    description: 'Data rows — each cell can be a string, number, boolean, or null',
                    items: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  columnWidths: { type: 'array', items: { type: 'integer' }, description: 'Custom column widths (omit for auto-sizing)' },
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
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Generate the real PPTX file
      const pptxBuffer = generatePptx(title, slides, template);
      await fs.writeFile(outputPath, pptxBuffer);

      const slideSummary = slides
        .map((s, i) => `  ${i + 1}. ${s.title} (${s.layout || (i === 0 ? 'title' : 'title_and_content')})`)
        .join('\n');

      return this.success(
        `PowerPoint generated: ${title}\n` +
        `Slides: ${slides.length}\n` +
        `Output: ${outputPath}\n` +
        `Size: ${pptxBuffer.length} bytes\n\n` +
        `Slide list:\n${slideSummary}`,
        { outputPath, slideCount: slides.length, template, sizeBytes: pptxBuffer.length },
      );
    } catch (err) {
      return this.error(
        `Failed to generate PowerPoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Generate the real DOCX file
      const docxBuffer = generateDocx(title, sections, template);
      await fs.writeFile(outputPath, docxBuffer);

      const sectionSummary = sections
        .map((s, i) => `  ${i + 1}. ${'#'.repeat(s.level || 1)} ${s.heading}`)
        .join('\n');

      return this.success(
        `Word document generated: ${title}\n` +
        `Sections: ${sections.length}\n` +
        `Output: ${outputPath}\n` +
        `Size: ${docxBuffer.length} bytes\n\n` +
        `Document structure:\n${sectionSummary}`,
        { outputPath, sectionCount: sections.length, template, sizeBytes: docxBuffer.length },
      );
    } catch (err) {
      return this.error(
        `Failed to generate Word document: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Generate the real XLSX file
      const xlsxBuffer = generateXlsx(title, sheets, template);
      await fs.writeFile(outputPath, xlsxBuffer);

      const sheetSummary = sheets
        .map((s) => `  ${s.name}: ${s.headers.length} columns, ${s.rows.length} rows`)
        .join('\n');

      return this.success(
        `Excel spreadsheet generated: ${title}\n` +
        `Sheets: ${sheets.length}\n` +
        `Output: ${outputPath}\n` +
        `Size: ${xlsxBuffer.length} bytes\n\n` +
        `Sheet summary:\n${sheetSummary}`,
        { outputPath, sheetCount: sheets.length, template, sizeBytes: xlsxBuffer.length },
      );
    } catch (err) {
      return this.error(
        `Failed to generate Excel: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── List templates ────────────────────────────────────────────────────────

  private async executeListTemplates(args: Record<string, unknown>): Promise<ToolResult> {
    const type = args.type as 'ppt' | 'docx' | 'xlsx' | undefined;

    let templates = BUILTIN_TEMPLATES;
    if (type) {
      templates = templates.filter((t) => t.type === type);
    }

    const output = templates
      .map((t) => `[${t.id}] ${t.name} (${t.type.toUpperCase()}) - ${t.description}`)
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
      const stat = await fs.stat(docPath);

      if (ext === '.pptx' || ext === '.docx' || ext === '.xlsx') {
        // For binary Office Open XML formats, provide file info
        const typeName = ext === '.pptx' ? 'PowerPoint' : ext === '.docx' ? 'Word' : 'Excel';
        return this.success(
          `Document: ${docPath}\n` +
          `Type: ${typeName} (${ext.substring(1).toUpperCase()})\n` +
          `Size: ${stat.size} bytes\n` +
          `Modified: ${stat.mtime.toISOString()}\n\n` +
          `Open in ${typeName} or a compatible application to view the full content.`,
          { path: docPath, type: ext.substring(1), sizeBytes: stat.size },
        );
      } else if (ext === '.csv') {
        const content = await fs.readFile(docPath, 'utf-8');
        const lines = content.split('\n').slice(0, 20);
        return this.success(
          `CSV Preview (${docPath}):\n${lines.join('\n')}`,
          { path: docPath, type: 'csv' },
        );
      } else if (ext === '.json') {
        // JSON representation (legacy fallback format)
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
            preview += `  ${sheet.name}: ${sheet.headers?.length || 0} cols x ${sheet.rows?.length || 0} rows\n`;
          }
        }

        return this.success(preview, { path: docPath, type: parsed.type });
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
    version: '2.0.0',
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
    version: '2.0.0',
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
    version: '2.0.0',
    enabled: false,
    settings: {
      outputDir: '',
      defaultTemplate: 'xlsx_data',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
