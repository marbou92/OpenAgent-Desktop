/**
 * OpenAgent-Desktop — XML Tool Call Parser (Phase 9.2)
 *
 * Some models (especially free/OpenAI-compatible ones) don't support
 * native function calling for tools with complex nested schemas. Instead,
 * they emit tool calls as plain TEXT in various XML-ish formats:
 *
 *   Format 1 (most common):
 *     <tool_calls>
 *     <invoke name="AskUserQuestion">
 *     <parameter name="question">Do you prefer A or B?</parameter>
 *     </invoke>
 *     </tool_calls>
 *
 *   Format 2 (ask_user_question custom tag):
 *     <ask_user_question>
 *     <question>Do you see a popup?</question>
 *     <option>Yes</option>
 *     <option>No</option>
 *     </ask_user_question>
 *
 *   Format 3 (Anthropic-style):
 *     <tool_use name="TodoWrite" id="123">{"todos": [...]}</tool_use>
 *
 *   Format 4 (function_call JSON):
 *     <function_call>{"name": "bash", "arguments": {"command": "ls"}}</function_call>
 *
 *   Format 5 (create_todo — model hallucinates a different tool name):
 *     <tool_calls>
 *     <invoke name="create_todo">
 *     <parameter name="content">Task 1: ...</parameter>
 *     </invoke>
 *     </tool_calls>
 *
 * The AI SDK doesn't parse any of these — it just passes them through as
 * text. So execute() never fires. This parser handles ALL the formats above
 * and normalizes the tool name + arguments.
 *
 * Tool name aliases: models often hallucinate different names for the same
 * tool. We map them back to the canonical name:
 *   create_todo, add_todo, todo_write, update_todos → TodoWrite
 *   ask_user_question, ask_user, question_user → AskUserQuestion
 *   run_command, shell, execute_command → bash
 *   read_file, cat → read
 *   write_file → write
 *   edit_file, replace → edit
 *   find_files → glob
 *   search, search_files → grep
 */

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  rawText: string;
}

// ─── Tool Name Aliases ────────────────────────────────────────────────────────
// Models hallucinate different names. Map them back to canonical names.
const TOOL_ALIASES: Record<string, string> = {
  // TodoWrite
  'create_todo': 'TodoWrite',
  'add_todo': 'TodoWrite',
  'todo_write': 'TodoWrite',
  'update_todos': 'TodoWrite',
  'update_todo': 'TodoWrite',
  'todo': 'TodoWrite',
  'todos': 'TodoWrite',
  // AskUserQuestion
  'ask_user_question': 'AskUserQuestion',
  'ask_user': 'AskUserQuestion',
  'question_user': 'AskUserQuestion',
  'ask_question': 'AskUserQuestion',
  'askuserquestion': 'AskUserQuestion',
  // bash
  'run_command': 'bash',
  'shell': 'bash',
  'execute_command': 'bash',
  'execute': 'bash',
  'terminal': 'bash',
  'cmd': 'bash',
  // read
  'read_file': 'read',
  'cat': 'read',
  'view_file': 'read',
  'open_file': 'read',
  // write
  'write_file': 'write',
  'create_file': 'write',
  'save_file': 'write',
  // edit
  'edit_file': 'edit',
  'replace': 'edit',
  'modify_file': 'edit',
  'update_file': 'edit',
  // glob
  'find_files': 'glob',
  'find': 'glob',
  'list_files_matching': 'glob',
  // grep
  'search': 'grep',
  'search_files': 'grep',
  'search_code': 'grep',
  'find_in_files': 'grep',
};

function canonicalizeToolName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TOOL_ALIASES[lower] || name;
}

/**
 * Scan text for ALL supported XML-style tool call patterns.
 * Returns all matches found, in order of appearance.
 */
export function parseXmlToolCalls(text: string): ParsedToolCall[] {
  if (!text) return [];
  const calls: ParsedToolCall[] = [];

  // ─── Format 2 FIRST: <ask_user_question>...</ask_user_question> ────────
  // This is a custom tag some models invent. Parse it before the generic
  // <tool_calls> patterns so we catch it even without a wrapper.
  calls.push(...parseAskUserQuestionTag(text));

  // ─── Format 1: <tool_calls><invoke name="X"><parameter name="Y">... ───
  calls.push(...parseToolCallsBlock(text));

  // ─── Format 3: <tool_use name="X" id="...">{json}</tool_use> ──────────
  calls.push(...parseToolUseTag(text));

  // ─── Format 4: <function_call>{json}</function_call> ──────────────────
  calls.push(...parseFunctionCallTag(text));

  // ─── Format 5: Bare <invoke name="X"> without <tool_calls> wrapper ────
  if (calls.length === 0) {
    calls.push(...parseBareInvoke(text));
  }

  // Canonicalize all tool names + coerce args
  return calls.map(c => ({
    ...c,
    name: canonicalizeToolName(c.name),
    args: coerceToolArgs(c.name, c.args),
  }));
}

// ─── Format 1: <tool_calls><invoke> ───────────────────────────────────────────

function parseToolCallsBlock(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const blockRegex = /<tool_calls>\s*(<invoke[\s\S]*?<\/invoke>)\s*<\/tool_calls>/gi;
  const invokeRegex = /<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/invoke>/gi;
  const paramRegex = /<parameter\s+name=["']([^"']+)["'](?:\s+[^>]*)?>([\s\S]*?)<\/parameter>/gi;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1];
    const fullBlock = blockMatch[0];

    let invokeMatch: RegExpExecArray | null;
    invokeRegex.lastIndex = 0;
    while ((invokeMatch = invokeRegex.exec(blockContent)) !== null) {
      const toolName = invokeMatch[1].trim();
      const invokeBody = invokeMatch[2];
      const args = extractParameters(invokeBody, paramRegex);
      calls.push({ name: toolName, args, rawText: fullBlock });
    }
  }
  return calls;
}

// ─── Format 2: <ask_user_question> ────────────────────────────────────────────

function parseAskUserQuestionTag(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const tagRegex = /<ask_user_question>([\s\S]*?)<\/ask_user_question>/gi;
  const questionRegex = /<question>([\s\S]*?)<\/question>/i;
  const headerRegex = /<header>([\s\S]*?)<\/header>/i;
  const optionRegex = /<option>([\s\S]*?)<\/option>/gi;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const body = match[1];
    const qMatch = questionRegex.exec(body);
    const hMatch = headerRegex.exec(body);
    const options: string[] = [];
    let optMatch: RegExpExecArray | null;
    optionRegex.lastIndex = 0;
    while ((optMatch = optionRegex.exec(body)) !== null) {
      options.push(optMatch[1].trim());
    }

    if (qMatch) {
      calls.push({
        name: 'AskUserQuestion',
        args: {
          questions: [{
            question: qMatch[1].trim(),
            header: hMatch ? hMatch[1].trim() : undefined,
            options: options.length > 0
              ? options.map(label => ({ label }))
              : [{ label: 'Yes' }, { label: 'No' }],
          }],
        },
        rawText: match[0],
      });
    }
  }
  return calls;
}

// ─── Format 3: <tool_use name="X" id="...">{json}</tool_use> ──────────────────

function parseToolUseTag(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /<tool_use\s+name=["']([^"']+)["'](?:\s+id=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/tool_use>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const toolName = match[1].trim();
    const body = match[3].trim();
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(body);
    } catch {
      // Body isn't JSON — try parameter-style parsing
      const paramRegex = /<parameter\s+name=["']([^"']+)["'](?:\s+[^>]*)?>([\s\S]*?)<\/parameter>/gi;
      args = extractParameters(body, paramRegex);
    }
    calls.push({ name: toolName, args, rawText: match[0] });
  }
  return calls;
}

// ─── Format 4: <function_call>{json}</function_call> ──────────────────────────

function parseFunctionCallTag(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /<function_call>\s*(\{[\s\S]*?\})\s*<\/function_call>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name) {
        calls.push({
          name: parsed.name,
          args: parsed.arguments || parsed.args || {},
          rawText: match[0],
        });
      }
    } catch { /* skip invalid JSON */ }
  }
  return calls;
}

// ─── Format 5: Bare <invoke> without wrapper ──────────────────────────────────

function parseBareInvoke(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const invokeRegex = /<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/invoke>/gi;
  const paramRegex = /<parameter\s+name=["']([^"']+)["'](?:\s+[^>]*)?>([\s\S]*?)<\/parameter>/gi;

  let match: RegExpExecArray | null;
  while ((match = invokeRegex.exec(text)) !== null) {
    const toolName = match[1].trim();
    const args = extractParameters(match[2], paramRegex);
    calls.push({ name: toolName, args, rawText: match[0] });
  }
  return calls;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractParameters(body: string, paramRegex: RegExp): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  let paramMatch: RegExpExecArray | null;
  paramRegex.lastIndex = 0;
  while ((paramMatch = paramRegex.exec(body)) !== null) {
    const paramName = paramMatch[1].trim();
    const paramValue = paramMatch[2].trim();
    // Try to parse JSON values (arrays, objects, booleans, numbers)
    args[paramName] = tryParseValue(paramValue);
  }
  return args;
}

function tryParseValue(s: string): unknown {
  const trimmed = s.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  // Try JSON (for arrays/objects)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { return s; }
  }
  return s;
}

/**
 * Coerce parsed XML arguments into the shape each tool expects.
 * Models often get the parameter names/shapes wrong — we fix the most
 * common mismatches so the tool's execute handler gets valid args.
 */
function coerceToolArgs(toolName: string, rawArgs: Record<string, unknown>): Record<string, unknown> {
  const args = { ...rawArgs };

  if (toolName === 'AskUserQuestion') {
    if (!Array.isArray(args.questions)) {
      const q = args.question || args.questions;
      if (typeof q === 'string') {
        let options: Array<{ label: string; description?: string }> = [];
        if (typeof args.options === 'string') {
          options = args.options.split(',').map((s: string) => s.trim()).filter(Boolean).map(label => ({ label }));
        } else if (Array.isArray(args.options)) {
          options = args.options.map((o: any) => typeof o === 'string' ? { label: o } : o);
        }
        if (options.length === 0) {
          options = [{ label: 'Yes' }, { label: 'No' }];
        }
        args.questions = [{
          question: q,
          header: typeof args.header === 'string' ? args.header : undefined,
          options,
        }];
      }
      delete args.question;
      delete args.options;
      delete args.header;
    }
  }

  if (toolName === 'TodoWrite') {
    if (!Array.isArray(args.todos)) {
      if (typeof args.todos === 'string') {
        const items = args.todos.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        args.todos = items.map((content: string, i: number) => ({
          id: String(i + 1),
          content,
          status: 'pending',
          priority: 'medium',
        }));
      } else if (typeof args.content === 'string') {
        args.todos = [{
          id: args.id || '1',
          content: args.content,
          status: args.status || 'pending',
          priority: args.priority || 'medium',
        }];
      }
      delete args.content;
      delete args.status;
      delete args.priority;
      delete args.id;
    }
  }

  // For bash/shell aliases, map common param names to `command`
  if (toolName === 'bash') {
    if (!args.command && typeof args.cmd === 'string') args.command = args.cmd;
    if (!args.command && typeof args.shell_command === 'string') args.command = args.shell_command;
    if (!args.command && typeof args.run === 'string') args.command = args.run;
  }

  // For read aliases, map common param names to `path`
  if (toolName === 'read') {
    if (!args.path && typeof args.file === 'string') args.path = args.file;
    if (!args.path && typeof args.filename === 'string') args.path = args.filename;
    if (!args.path && typeof args.file_path === 'string') args.path = args.file_path;
  }

  return args;
}

/**
 * Remove XML tool call blocks from text so the user doesn't see raw XML.
 */
export function stripXmlToolCalls(text: string): string {
  if (!text) return text;
  let cleaned = text;
  cleaned = cleaned.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/gi, '');
  cleaned = cleaned.replace(/<ask_user_question>[\s\S]*?<\/ask_user_question>/gi, '');
  cleaned = cleaned.replace(/<function_call>[\s\S]*?<\/function_call>/gi, '');
  cleaned = cleaned.replace(/<tool_use\s+name=["'][^"']+["'][\s\S]*?<\/tool_use>/gi, '');
  cleaned = cleaned.replace(/<invoke\s+name=["'][^"']+["'][\s\S]*?<\/invoke>/gi, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}
