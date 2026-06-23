/**
 * OpenAgent-Desktop — XML Tool Call Parser (Phase 9.1)
 *
 * Some models (especially free/OpenAI-compatible ones) don't support
 * native function calling for tools with complex nested schemas. Instead,
 * they emit XML-style tool calls as plain TEXT in the response:
 *
 *   <tool_calls>
 *   <invoke name="AskUserQuestion">
 *   <parameter name="question">Do you prefer A or B?</parameter>
 *   </invoke>
 *   </tool_calls>
 *
 * The AI SDK doesn't parse this — it just passes it through as text content.
 * So the execute() handler never fires, and the user sees raw XML instead
 * of a dialog.
 *
 * This parser scans the accumulated text for these patterns, extracts the
 * tool name + parameters, and returns a structured tool call that the
 * caller can execute.
 *
 * Supported formats (models vary):
 *   <tool_calls><invoke name="X"><parameter name="Y">value</parameter></invoke></tool_calls>
 *   <function_call>{ "name": "X", "arguments": { "Y": "value" } }</function_call>
 *   ```xml\n<tool_calls>...</tool_calls>\n```
 *
 * For AskUserQuestion specifically, the model often passes a single `question`
 * string instead of the `questions` array the schema expects. We coerce it.
 * Same for TodoWrite — the model may pass individual fields instead of a
 * `todos` array.
 */

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  rawText: string; // The original XML text (for stripping from the response)
}

/**
 * Scan text for XML-style tool call patterns. Returns all matches found,
 * in order of appearance. Each match includes the raw XML block so the
 * caller can strip it from the visible response.
 */
export function parseXmlToolCalls(text: string): ParsedToolCall[] {
  if (!text) return [];
  const calls: ParsedToolCall[] = [];

  // Pattern 1: <tool_calls>...<invoke name="X">...<parameter name="Y">value</parameter>...</invoke>...</tool_calls>
  // This is the most common format used by models that fall back to XML.
  const toolCallsBlockRegex = /<tool_calls>\s*(<invoke[\s\S]*?<\/invoke>)\s*<\/tool_calls>/gi;
  const invokeRegex = /<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/invoke>/gi;
  const paramRegex = /<parameter\s+name=["']([^"']+)["'](?:\s+[^>]*)?>([\s\S]*?)<\/parameter>/gi;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = toolCallsBlockRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1];
    const fullBlock = blockMatch[0];

    let invokeMatch: RegExpExecArray | null;
    invokeRegex.lastIndex = 0;
    while ((invokeMatch = invokeRegex.exec(blockContent)) !== null) {
      const toolName = invokeMatch[1].trim();
      const invokeBody = invokeMatch[2];

      // Extract parameters
      const args: Record<string, unknown> = {};
      let paramMatch: RegExpExecArray | null;
      paramRegex.lastIndex = 0;
      while ((paramMatch = paramRegex.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1].trim();
        const paramValue = paramMatch[2].trim();
        args[paramName] = paramValue;
      }

      calls.push({
        name: toolName,
        args: coerceToolArgs(toolName, args),
        rawText: fullBlock,
      });
    }
  }

  // Pattern 2: <function_call>{ "name": "X", "arguments": {...} }</function_call>
  // Some models use this JSON-in-XML format.
  const funcCallRegex = /<function_call>\s*(\{[\s\S]*?\})\s*<\/function_call>/gi;
  let funcMatch: RegExpExecArray | null;
  while ((funcMatch = funcCallRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(funcMatch[1]);
      if (parsed.name && parsed.arguments) {
        calls.push({
          name: parsed.name,
          args: coerceToolArgs(parsed.name, parsed.arguments),
          rawText: funcMatch[0],
        });
      }
    } catch {
      // JSON parse failed — skip this match.
    }
  }

  // Pattern 3: Bare <invoke name="X"><parameter name="Y">value</parameter></invoke>
  // without the <tool_calls> wrapper.
  if (calls.length === 0) {
    invokeRegex.lastIndex = 0;
    let bareInvoke: RegExpExecArray | null;
    while ((bareInvoke = invokeRegex.exec(text)) !== null) {
      const toolName = bareInvoke[1].trim();
      const invokeBody = bareInvoke[2];
      const args: Record<string, unknown> = {};
      let paramMatch: RegExpExecArray | null;
      paramRegex.lastIndex = 0;
      while ((paramMatch = paramRegex.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1].trim();
        const paramValue = paramMatch[2].trim();
        args[paramName] = paramValue;
      }
      calls.push({
        name: toolName,
        args: coerceToolArgs(toolName, args),
        rawText: bareInvoke[0],
      });
    }
  }

  return calls;
}

/**
 * Coerce parsed XML arguments into the shape each tool expects.
 *
 * Models often get the parameter names/shapes wrong when falling back to
 * XML — e.g. AskUserQuestion expects `questions: [{question, options: [...]}]`
 * but the model passes `question: "..."` (singular string). We fix the
 * most common mismatches here so the tool's execute handler gets valid args.
 */
function coerceToolArgs(toolName: string, rawArgs: Record<string, unknown>): Record<string, unknown> {
  const args = { ...rawArgs };

  if (toolName === 'AskUserQuestion') {
    // The tool expects: { questions: [{ question: string, header?: string, options: [{label, description?}] }] }
    // Models often pass: { question: "What's your name?" } (singular)
    // or: { questions: "What's your name?" } (string instead of array)
    // or: { question: "...", options: "A, B, C" } (comma-separated string)
    if (!Array.isArray(args.questions)) {
      // If there's a singular `question` field, wrap it into the array shape.
      const q = args.question || args.questions;
      if (typeof q === 'string') {
        // Try to parse options from a comma-separated string or an `options` field.
        let options: Array<{ label: string; description?: string }> = [];
        if (typeof args.options === 'string') {
          options = args.options.split(',').map((s: string) => s.trim()).filter(Boolean).map(label => ({ label }));
        } else if (Array.isArray(args.options)) {
          options = args.options.map((o: any) => typeof o === 'string' ? { label: o } : o);
        }
        // If no options provided, add generic Yes/No so the dialog can render.
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
    // The tool expects: { todos: [{ id, content, status, priority? }] }
    // Models often pass individual fields or comma-separated strings.
    if (!Array.isArray(args.todos)) {
      // Try to build a todos array from whatever the model gave us.
      if (typeof args.todos === 'string') {
        // Comma-separated or newline-separated list of tasks.
        const items = args.todos.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        args.todos = items.map((content: string, i: number) => ({
          id: String(i + 1),
          content,
          status: 'pending',
          priority: 'medium',
        }));
      } else if (typeof args.content === 'string') {
        // Single todo.
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

  return args;
}

/**
 * Remove XML tool call blocks from the text so the user doesn't see
 * raw XML in the chat. Returns the cleaned text.
 */
export function stripXmlToolCalls(text: string): string {
  if (!text) return text;
  let cleaned = text;
  // Remove <tool_calls>...</tool_calls> blocks.
  cleaned = cleaned.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/gi, '');
  // Remove <function_call>...</function_call> blocks.
  cleaned = cleaned.replace(/<function_call>[\s\S]*?<\/function_call>/gi, '');
  // Remove bare <invoke>...</invoke> blocks (only if no <tool_calls> wrapper matched).
  cleaned = cleaned.replace(/<invoke\s+name=["'][^"']+["'][\s\S]*?<\/invoke>/gi, '');
  // Clean up extra whitespace left behind.
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}
