/**
 * Tool renderers — per-tool specialized cards.
 *
 * Side-effect of importing this module: registers each renderer in the
 * global ToolRenderers registry via `registerToolRenderer(toolName, ...)`.
 *
 * ToolUseCard looks up `getToolRenderer(toolCall.name)`; if it finds one,
 * it delegates the render to it (otherwise falls back to the generic card).
 *
 *   bash  → BashToolCard   — terminal-style command + exit code + output
 *   edit  → EditToolCard   — file path + inline diff (old − / new +)
 *   grep  → GrepToolCard   — pattern + file:line:content matches
 *   read  → ReadToolCard   — file path + content with line numbers
 *   write → WriteToolCard  — file path + first-10-line preview
 *   glob  → GlobToolCard   — pattern + matched file list
 */
import { registerToolRenderer } from '../ToolRenderers';
import BashToolCard from './BashToolCard';
import EditToolCard from './EditToolCard';
import GrepToolCard from './GrepToolCard';
import ReadToolCard from './ReadToolCard';
import WriteToolCard from './WriteToolCard';
import GlobToolCard from './GlobToolCard';

// ─── Register all tool renderers ─────────────────────────────────────────────
registerToolRenderer('bash', BashToolCard);
registerToolRenderer('edit', EditToolCard);
registerToolRenderer('grep', GrepToolCard);
registerToolRenderer('read', ReadToolCard);
registerToolRenderer('write', WriteToolCard);
registerToolRenderer('glob', GlobToolCard);

// Re-export all cards so consumers can import them directly if needed.
export { BashToolCard, EditToolCard, GrepToolCard, ReadToolCard, WriteToolCard, GlobToolCard };

/**
 * Importing this module anywhere in the app ensures all tool renderers
 * are registered. ToolUseCard (or any other consumer) can then look them
 * up via `getToolRenderer(toolName)`.
 *
 *   import '@/components/Chat/message/tools';
 *
 * — or —
 *
 *   import './tools';  // from a sibling module
 */
export default {};
