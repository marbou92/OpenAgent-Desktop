/**
 * OpenAgent-Desktop - Computer Controller Extension
 *
 * Controls the computer via accessibility APIs (macOS/Windows):
 * - see_screen: Capture and annotate screen with UI element IDs
 * - click_element: Click UI element by ID
 * - type_text: Type text into focused element
 * - scroll: Scroll in a direction
 * - drag: Drag between elements
 * - keyboard_shortcut: Execute keyboard shortcut
 * - open_application: Open an application
 *
 * Works across any macOS/Windows application via accessibility APIs.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolResult,
  PermissionLevel,
} from '../types';

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// UI Element representation
// ─────────────────────────────────────────────────────────────────────────────

interface UIElement {
  id: string;
  type: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  focused: boolean;
  role: string;
  text?: string;
  children?: UIElement[];
}

interface ScreenAnnotation {
  elements: UIElement[];
  screenWidth: number;
  screenHeight: number;
  screenshotBase64?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform-specific accessibility command builders
// ─────────────────────────────────────────────────────────────────────────────

class AccessibilityBridge {
  private platform: string;

  constructor() {
    this.platform = os.platform();
  }

  /** Get the screen size */
  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.platform === 'darwin') {
      const { stdout } = await execAsync(
        'osascript -e \'tell application "Finder" to get bounds of window of desktop\'',
      );
      const parts = stdout.trim().split(', ').map(Number);
      return { width: parts[2] || 1920, height: parts[3] || 1080 };
    } else if (this.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds"',
      );
      const widthMatch = stdout.match(/Width=(\d+)/);
      const heightMatch = stdout.match(/Height=(\d+)/);
      return {
        width: widthMatch ? parseInt(widthMatch[1]) : 1920,
        height: heightMatch ? parseInt(heightMatch[1]) : 1080,
      };
    }
    return { width: 1920, height: 1080 };
  }

  /** Get all visible UI elements on screen */
  async getUIElements(): Promise<UIElement[]> {
    if (this.platform === 'darwin') {
      return this.getMacUIElements();
    } else if (this.platform === 'win32') {
      return this.getWinUIElements();
    }
    return [];
  }

  /** macOS: Get UI elements using AppleScript and Accessibility */
  private async getMacUIElements(): Promise<UIElement[]> {
    const script = `
      tell application "System Events"
        set output to ""
        set elementIndex to 0
        repeat with proc in (every process whose visible is true)
          try
            set procName to name of proc
            repeat with win in every window of proc
              try
                set winName to name of win
                set elementIndex to elementIndex + 1
                set output to output & "ELEMENT:" & elementIndex & "|ROLE:window|LABEL:" & winName & "|APP:" & procName & "\\n"
                -- Get UI elements within the window
                set uiItems to every UI element of win
                repeat with uiItem in uiItems
                  try
                    set elementIndex to elementIndex + 1
                    set itemRole to role of uiItem
                    set itemDesc to description of uiItem
                    set itemVal to value of uiItem
                    set itemEnabled to enabled of uiItem
                    set itemPos to position of uiItem
                    set itemSize to size of uiItem
                    set output to output & "ELEMENT:" & elementIndex & "|ROLE:" & itemRole & "|LABEL:" & itemDesc & "|VALUE:" & itemVal & "|ENABLED:" & itemEnabled & "|POS:" & (item 1 of itemPos) & "," & (item 2 of itemPos) & "|SIZE:" & (item 1 of itemSize) & "," & (item 2 of itemSize) & "|APP:" & procName & "\\n"
                  end try
                end repeat
              end try
            end repeat
          end try
        end repeat
        return output
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
        timeout: 10000,
      });
      return this.parseMacElements(stdout);
    } catch (err) {
      // Fallback: return minimal screen info
      const screenSize = await this.getScreenSize();
      return [
        {
          id: 'screen',
          type: 'screen',
          label: 'Full Screen',
          bounds: { x: 0, y: 0, width: screenSize.width, height: screenSize.height },
          enabled: true,
          focused: false,
          role: 'screen',
        },
      ];
    }
  }

  /** Parse macOS AppleScript output into UIElement array */
  private parseMacElements(output: string): UIElement[] {
    const elements: UIElement[] = [];
    const lines = output.trim().split('\n').filter((l) => l.startsWith('ELEMENT:'));

    for (const line of lines) {
      const parts: Record<string, string> = {};
      const segments = line.split('|');
      for (const segment of segments) {
        const [key, ...valueParts] = segment.split(':');
        parts[key.trim()] = valueParts.join(':').trim();
      }

      const posParts = (parts['POS'] || '0,0').split(',').map(Number);
      const sizeParts = (parts['SIZE'] || '0,0').split(',').map(Number);

      elements.push({
        id: parts['ELEMENT'] || String(elements.length),
        type: parts['ROLE'] || 'unknown',
        label: parts['LABEL'] || parts['VALUE'] || '',
        bounds: {
          x: posParts[0] || 0,
          y: posParts[1] || 0,
          width: sizeParts[0] || 0,
          height: sizeParts[1] || 0,
        },
        enabled: parts['ENABLED'] !== 'false',
        focused: false,
        role: parts['ROLE'] || 'unknown',
        text: parts['VALUE'],
      });
    }

    return elements;
  }

  /** Windows: Get UI elements using UI Automation via PowerShell */
  private async getWinUIElements(): Promise<UIElement[]> {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $cond = [System.Windows.Automation.Condition]::TrueCondition
      $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
      $output = @()
      $index = 0
      foreach ($el in $elements) {
        $index++
        try {
          $rect = $el.Current.BoundingRectangle
          $output += "ELEMENT:$index|ROLE:$($el.Current.ControlType.ProgrammaticName)|LABEL:$($el.Current.Name)|ENABLED:$($el.Current.IsEnabled)|POS:$([int]$rect.X),$([int]$rect.Y)|SIZE:$([int]$rect.Width),$([int]$rect.Height)"
        } catch {}
      }
      $output -join "\\n"
    `;

    try {
      const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, {
        timeout: 10000,
      });
      return this.parseWinElements(stdout);
    } catch (err) {
      const screenSize = await this.getScreenSize();
      return [
        {
          id: 'screen',
          type: 'screen',
          label: 'Full Screen',
          bounds: { x: 0, y: 0, width: screenSize.width, height: screenSize.height },
          enabled: true,
          focused: false,
          role: 'screen',
        },
      ];
    }
  }

  /** Parse Windows PowerShell output into UIElement array */
  private parseWinElements(output: string): UIElement[] {
    const elements: UIElement[] = [];
    const lines = output.trim().split('\n').filter((l) => l.startsWith('ELEMENT:'));

    for (const line of lines) {
      const parts: Record<string, string> = {};
      const segments = line.split('|');
      for (const segment of segments) {
        const [key, ...valueParts] = segment.split(':');
        parts[key.trim()] = valueParts.join(':').trim();
      }

      const posParts = (parts['POS'] || '0,0').split(',').map(Number);
      const sizeParts = (parts['SIZE'] || '0,0').split(',').map(Number);

      elements.push({
        id: parts['ELEMENT'] || String(elements.length),
        type: parts['ROLE'] || 'unknown',
        label: parts['LABEL'] || '',
        bounds: {
          x: posParts[0] || 0,
          y: posParts[1] || 0,
          width: sizeParts[0] || 0,
          height: sizeParts[1] || 0,
        },
        enabled: parts['ENABLED'] !== 'False',
        focused: false,
        role: parts['ROLE'] || 'unknown',
        text: parts['LABEL'],
      });
    }

    return elements;
  }

  /** Click at specific coordinates */
  async clickAt(x: number, y: number): Promise<void> {
    if (this.platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`,
        { timeout: 5000 },
      );
    } else if (this.platform === 'win32') {
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int info);' -Name U32 -Namespace W; [W.U32]::mouse_event(2, 0, 0, 0, 0); [W.U32]::mouse_event(4, 0, 0, 0, 0)"`,
        { timeout: 5000 },
      );
    } else {
      throw new Error(`Click not supported on platform: ${this.platform}`);
    }
  }

  /** Type text */
  async typeText(text: string): Promise<void> {
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    if (this.platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "${escaped}"'`,
        { timeout: 10000 },
      );
    } else if (this.platform === 'win32') {
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')"`,
        { timeout: 10000 },
      );
    } else {
      throw new Error(`Type text not supported on platform: ${this.platform}`);
    }
  }

  /** Press keyboard shortcut */
  async keyboardShortcut(keys: string[]): Promise<void> {
    if (this.platform === 'darwin') {
      const modifiers = keys.slice(0, -1).map((k) => this.macModifier(k));
      const key = keys[keys.length - 1];
      const modifierStr = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';

      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "${key}"${modifierStr}'`,
        { timeout: 5000 },
      );
    } else if (this.platform === 'win32') {
      const shortcutStr = keys.map((k) => this.winKey(k)).join('+');
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${shortcutStr}')"`,
        { timeout: 5000 },
      );
    } else {
      throw new Error(`Keyboard shortcuts not supported on platform: ${this.platform}`);
    }
  }

  /** Scroll at a position */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    if (this.platform === 'darwin') {
      const scrollCmd = direction === 'up' || direction === 'down'
        ? `tell application "System Events" to scroll ${direction === 'up' ? '-' : ''}${amount * 3}`
        : `tell application "System Events" to scroll ${direction === 'left' ? '-' : ''}${amount * 3}`;

      await execAsync(`osascript -e '${scrollCmd}'`, { timeout: 5000 });
    } else if (this.platform === 'win32') {
      const delta = direction === 'up' ? 120 : direction === 'down' ? -120 : 0;
      const repeats = Math.max(1, amount);
      for (let i = 0; i < repeats; i++) {
        await execAsync(
          `powershell -Command "Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int info);' -Name U32 -Namespace W; [W.U32]::mouse_event(2048, 0, 0, ${delta}, 0)"`,
          { timeout: 5000 },
        );
      }
    }
  }

  /** Drag from one position to another */
  async drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    if (this.platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "System Events" to drag from {${fromX}, ${fromY}} to {${toX}, ${toY}}'`,
        { timeout: 5000 },
      );
    } else if (this.platform === 'win32') {
      // Windows: move to start, press down, move to end, release
      await execAsync(
        `powershell -Command "
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${fromX},${fromY})
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int info);' -Name U32 -Namespace W
          [W.U32]::mouse_event(2, 0, 0, 0, 0)
          Start-Sleep -Milliseconds 100
          [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${toX},${toY})
          Start-Sleep -Milliseconds 100
          [W.U32]::mouse_event(4, 0, 0, 0, 0)
        "`,
        { timeout: 5000 },
      );
    }
  }

  /** Open an application by name */
  async openApplication(name: string): Promise<void> {
    if (this.platform === 'darwin') {
      await execAsync(`open -a "${name}"`, { timeout: 10000 });
    } else if (this.platform === 'win32') {
      await execAsync(`start "" "${name}"`, { timeout: 10000, shell: 'cmd.exe' });
    } else {
      throw new Error(`Open application not supported on platform: ${this.platform}`);
    }
  }

  /** Map modifier key name to macOS AppleScript modifier */
  private macModifier(key: string): string {
    const map: Record<string, string> = {
      command: 'command down',
      cmd: 'command down',
      control: 'control down',
      ctrl: 'control down',
      option: 'option down',
      alt: 'option down',
      shift: 'shift down',
    };
    return map[key.toLowerCase()] || key;
  }

  /** Map key name to Windows SendKeys format */
  private winKey(key: string): string {
    const map: Record<string, string> = {
      command: '^',
      cmd: '^',
      control: '^',
      ctrl: '^',
      option: '%',
      alt: '%',
      shift: '+',
      enter: '{ENTER}',
      tab: '{TAB}',
      escape: '{ESC}',
      backspace: '{BACKSPACE}',
      delete: '{DELETE}',
      up: '{UP}',
      down: '{DOWN}',
      left: '{LEFT}',
      right: '{RIGHT}',
    };
    return map[key.toLowerCase()] || key;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Computer Controller Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class ComputerControllerExtension extends BaseExtension {
  private bridge: AccessibilityBridge;
  private lastAnnotation: ScreenAnnotation | null = null;

  constructor(config: ExtensionConfig) {
    super(config);
    this.bridge = new AccessibilityBridge();
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'see_screen',
        description:
          'Capture the screen and annotate all visible UI elements with IDs. ' +
          'Returns a list of interactive elements with their positions, types, and labels. ' +
          'Use this before clicking or interacting with UI elements.',
        parameters: {
          type: 'object',
          properties: {
            include_screenshot: {
              type: 'boolean',
              description: 'Whether to include a base64-encoded screenshot (default: true)',
              default: true,
            },
          },
        },
      },
      this.executeSeeScreen.bind(this),
    );

    this.registerTool(
      {
        name: 'click_element',
        description:
          'Click a UI element identified by its element ID (from see_screen). ' +
          'Alternatively, provide x/y coordinates to click at a specific position.',
        parameters: {
          type: 'object',
          properties: {
            element_id: {
              type: 'string',
              description: 'The element ID from see_screen to click',
            },
            x: {
              type: 'integer',
              description: 'X coordinate to click at (alternative to element_id)',
            },
            y: {
              type: 'integer',
              description: 'Y coordinate to click at (alternative to element_id)',
            },
            button: {
              type: 'string',
              description: 'Mouse button to use',
              enum: ['left', 'right', 'middle'],
              default: 'left',
            },
            double_click: {
              type: 'boolean',
              description: 'Whether to double-click (default: false)',
              default: false,
            },
          },
        },
      },
      this.executeClickElement.bind(this),
    );

    this.registerTool(
      {
        name: 'type_text',
        description:
          'Type text into the currently focused UI element. ' +
          'Use click_element first to focus the target element.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text to type',
            },
            clear_first: {
              type: 'boolean',
              description: 'Whether to clear the field before typing (default: false)',
              default: false,
            },
          },
          required: ['text'],
        },
      },
      this.executeTypeText.bind(this),
    );

    this.registerTool(
      {
        name: 'scroll',
        description: 'Scroll the screen or a specific element in a given direction.',
        parameters: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              description: 'Direction to scroll',
              enum: ['up', 'down', 'left', 'right'],
            },
            amount: {
              type: 'integer',
              description: 'Number of scroll steps (default: 3)',
              minimum: 1,
              maximum: 50,
              default: 3,
            },
          },
          required: ['direction'],
        },
      },
      this.executeScroll.bind(this),
    );

    this.registerTool(
      {
        name: 'drag',
        description:
          'Drag from one element/position to another. Provide element IDs or coordinates.',
        parameters: {
          type: 'object',
          properties: {
            from_id: {
              type: 'string',
              description: 'Element ID to drag from',
            },
            to_id: {
              type: 'string',
              description: 'Element ID to drag to',
            },
            from_x: {
              type: 'integer',
              description: 'X coordinate to drag from (alternative to from_id)',
            },
            from_y: {
              type: 'integer',
              description: 'Y coordinate to drag from (alternative to from_id)',
            },
            to_x: {
              type: 'integer',
              description: 'X coordinate to drag to (alternative to to_id)',
            },
            to_y: {
              type: 'integer',
              description: 'Y coordinate to drag to (alternative to to_id)',
            },
          },
        },
      },
      this.executeDrag.bind(this),
    );

    this.registerTool(
      {
        name: 'keyboard_shortcut',
        description:
          'Execute a keyboard shortcut. Provide an array of keys to press simultaneously, ' +
          'e.g. ["command", "c"] for Cmd+C or ["control", "shift", "s"] for Ctrl+Shift+S.',
        parameters: {
          type: 'object',
          properties: {
            keys: {
              type: 'array',
              description: 'Array of keys to press simultaneously (modifiers first, then the key)',
              items: { type: 'string' },
            },
          },
          required: ['keys'],
        },
      },
      this.executeKeyboardShortcut.bind(this),
    );

    this.registerTool(
      {
        name: 'open_application',
        description: 'Open an application by name (e.g., "Safari", "Chrome", "Terminal", "Notepad").',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the application to open',
            },
          },
          required: ['name'],
        },
      },
      this.executeOpenApplication.bind(this),
    );

    // Set permissions
    this.setPermissions([
      {
        level: PermissionLevel.Admin,
        reason: 'Requires full system access for screen control and accessibility APIs',
        resources: ['screen', 'keyboard', 'mouse', 'accessibility'],
      },
    ]);
  }

  // ─── see_screen ────────────────────────────────────────────────────────────

  private async executeSeeScreen(args: Record<string, unknown>): Promise<ToolResult> {
    const includeScreenshot = args.include_screenshot !== false;

    try {
      const elements = await this.bridge.getUIElements();
      const screenSize = await this.bridge.getScreenSize();

      const annotation: ScreenAnnotation = {
        elements,
        screenWidth: screenSize.width,
        screenHeight: screenSize.height,
      };

      // Optionally capture screenshot
      if (includeScreenshot) {
        try {
          const { screenshot } = require('screenshot-desktop');
          const imgBuffer = await screenshot({ format: 'png' });
          annotation.screenshotBase64 = imgBuffer.toString('base64');
        } catch {
          this.logger.warn('Screenshot capture failed, proceeding without screenshot');
        }
      }

      this.lastAnnotation = annotation;

      // Format the output for the AI agent
      const output: string[] = [];
      output.push(`Screen: ${screenSize.width}x${screenSize.height}`);
      output.push(`Visible UI Elements: ${elements.length}`);
      output.push('─'.repeat(60));

      for (const el of elements) {
        const center = {
          x: el.bounds.x + el.bounds.width / 2,
          y: el.bounds.y + el.bounds.height / 2,
        };

        const labelInfo = el.label ? ` "${el.label}"` : '';
        const textInfo = el.text ? ` [${el.text.substring(0, 50)}]` : '';
        const disabledInfo = !el.enabled ? ' (disabled)' : '';

        output.push(
          `[${el.id}] ${el.role}${labelInfo}${textInfo}${disabledInfo} @ (${Math.round(center.x)}, ${Math.round(center.y)}) ${el.bounds.width}x${el.bounds.height}`,
        );
      }

      return this.success(output.join('\n'), {
        elementCount: elements.length,
        screenSize,
        screenshotIncluded: !!annotation.screenshotBase64,
        screenshotBase64: annotation.screenshotBase64,
      });
    } catch (err) {
      return this.error(
        `Failed to capture screen: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── click_element ─────────────────────────────────────────────────────────

  private async executeClickElement(args: Record<string, unknown>): Promise<ToolResult> {
    const elementId = args.element_id as string | undefined;
    const targetX = args.x as number | undefined;
    const targetY = args.y as number | undefined;
    const button = (args.button as string) || 'left';
    const doubleClick = args.double_click as boolean;

    let clickX: number;
    let clickY: number;

    if (elementId) {
      // Find the element in the last annotation
      if (!this.lastAnnotation) {
        return this.error('No screen annotation available. Call see_screen first.');
      }

      const element = this.lastAnnotation.elements.find((el) => el.id === elementId);
      if (!element) {
        return this.error(
          `Element "${elementId}" not found. Call see_screen to refresh the element list.`,
        );
      }

      clickX = element.bounds.x + element.bounds.width / 2;
      clickY = element.bounds.y + element.bounds.height / 2;
    } else if (targetX !== undefined && targetY !== undefined) {
      clickX = targetX;
      clickY = targetY;
    } else {
      return this.error('Provide either element_id or x/y coordinates.');
    }

    try {
      await this.bridge.clickAt(clickX, clickY);

      if (doubleClick) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await this.bridge.clickAt(clickX, clickY);
      }

      return this.success(
        `Clicked at (${Math.round(clickX)}, ${Math.round(clickY)})${elementId ? ` [element: ${elementId}]` : ''} (${button}${doubleClick ? ', double' : ''})`,
        { x: clickX, y: clickY, elementId, button, doubleClick },
      );
    } catch (err) {
      return this.error(
        `Click failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── type_text ─────────────────────────────────────────────────────────────

  private async executeTypeText(args: Record<string, unknown>): Promise<ToolResult> {
    const text = args.text as string;
    const clearFirst = args.clear_first as boolean;

    try {
      if (clearFirst) {
        // Select all and delete
        await this.bridge.keyboardShortcut(['command', 'a']);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await this.bridge.typeText(text);

      return this.success(
        `Typed "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" (${text.length} characters)`,
        { textLength: text.length, cleared: clearFirst },
      );
    } catch (err) {
      return this.error(
        `Type text failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── scroll ────────────────────────────────────────────────────────────────

  private async executeScroll(args: Record<string, unknown>): Promise<ToolResult> {
    const direction = args.direction as 'up' | 'down' | 'left' | 'right';
    const amount = (args.amount as number) || 3;

    try {
      await this.bridge.scroll(direction, amount);
      return this.success(`Scrolled ${direction} by ${amount}`, { direction, amount });
    } catch (err) {
      return this.error(
        `Scroll failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── drag ──────────────────────────────────────────────────────────────────

  private async executeDrag(args: Record<string, unknown>): Promise<ToolResult> {
    const fromId = args.from_id as string | undefined;
    const toId = args.to_id as string | undefined;
    const fromX = args.from_x as number | undefined;
    const fromY = args.from_y as number | undefined;
    const toX = args.to_x as number | undefined;
    const toY = args.to_y as number | undefined;

    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;

    if (!this.lastAnnotation && (fromId || toId)) {
      return this.error('No screen annotation available. Call see_screen first.');
    }

    if (fromId) {
      const element = this.lastAnnotation!.elements.find((el) => el.id === fromId);
      if (!element) return this.error(`From element "${fromId}" not found.`);
      startX = element.bounds.x + element.bounds.width / 2;
      startY = element.bounds.y + element.bounds.height / 2;
    } else if (fromX !== undefined && fromY !== undefined) {
      startX = fromX;
      startY = fromY;
    } else {
      return this.error('Provide from_id or from_x/from_y.');
    }

    if (toId) {
      const element = this.lastAnnotation!.elements.find((el) => el.id === toId);
      if (!element) return this.error(`To element "${toId}" not found.`);
      endX = element.bounds.x + element.bounds.width / 2;
      endY = element.bounds.y + element.bounds.height / 2;
    } else if (toX !== undefined && toY !== undefined) {
      endX = toX;
      endY = toY;
    } else {
      return this.error('Provide to_id or to_x/to_y.');
    }

    try {
      await this.bridge.drag(startX, startY, endX, endY);
      return this.success(
        `Dragged from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(endX)}, ${Math.round(endY)})`,
        { startX, startY, endX, endY, fromId, toId },
      );
    } catch (err) {
      return this.error(
        `Drag failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── keyboard_shortcut ─────────────────────────────────────────────────────

  private async executeKeyboardShortcut(args: Record<string, unknown>): Promise<ToolResult> {
    const keys = args.keys as string[];
    if (!keys || keys.length === 0) {
      return this.error('At least one key is required.');
    }

    try {
      await this.bridge.keyboardShortcut(keys);
      return this.success(`Pressed keyboard shortcut: ${keys.join('+')}`, { keys });
    } catch (err) {
      return this.error(
        `Keyboard shortcut failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── open_application ──────────────────────────────────────────────────────

  private async executeOpenApplication(args: Record<string, unknown>): Promise<ToolResult> {
    const name = args.name as string;

    try {
      await this.bridge.openApplication(name);
      return this.success(`Opened application: ${name}`, { applicationName: name });
    } catch (err) {
      return this.error(
        `Failed to open "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createComputerControllerExtension(): ExtensionConfig {
  return {
    id: 'computer_controller',
    type: ExtensionType.ComputerController,
    name: 'Computer Controller',
    description: 'Control the computer via accessibility APIs: see screen, click, type, scroll, drag, keyboard shortcuts, and open applications',
    version: '1.0.0',
    enabled: false,
    settings: {
      requireConfirmation: true,
      screenshotQuality: 'medium',
      interactionDelay: 100,
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
