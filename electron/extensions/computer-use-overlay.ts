/**
 * OpenAgent-Desktop - Computer Use Overlay Manager
 *
 * Manages the computer use overlay that shows GUI automation actions.
 * Like OpenCowork's computer use visualization and Goose's GUI automation.
 * Coordinates screenshot capture, action display, and user control.
 *
 * Features:
 *   - Overlay window management (show/hide/transparency)
 *   - Action recording (click, type, scroll, screenshot, drag)
 *   - Action visualization with visual feedback
 *   - Region highlighting and screenshot annotation
 *   - User control: pause/resume/cancel automation
 *   - Safety: confirmation before destructive actions
 *   - Action replay
 *   - Events for all state changes
 */

import { EventEmitter } from 'events';

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface ComputerUseAction {
  id: string;
  type: 'click' | 'type' | 'scroll' | 'screenshot' | 'drag';
  coordinates?: { x: number; y: number };
  text?: string;
  duration?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface HighlightRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
  opacity?: number;
}

export type OverlayState = 'hidden' | 'showing' | 'recording' | 'paused';

export type ActionCategory = 'safe' | 'moderate' | 'destructive';

export interface DestructiveActionCheck {
  isDestructive: boolean;
  category: ActionCategory;
  reason?: string;
}

export interface ReplayOptions {
  speed: number; // 1 = normal, 0.5 = half speed, 2 = double speed
  delay: number; // ms between actions
  onAction?: (action: ComputerUseAction, index: number) => void;
}

export interface ScreenshotData {
  buffer: Buffer;
  width: number;
  height: number;
  annotations: HighlightRegion[];
  timestamp: string;
}

// ─── Safety Patterns ──────────────────────────────────────────────────────────

const DESTRUCTIVE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /delete/i, reason: 'Delete button detected' },
  { pattern: /remove/i, reason: 'Remove button detected' },
  { pattern: /trash/i, reason: 'Trash action detected' },
  { pattern: /format/i, reason: 'Format action detected' },
  { pattern: /erase/i, reason: 'Erase action detected' },
  { pattern: /drop/i, reason: 'Drop action detected' },
  { pattern: /reset/i, reason: 'Reset action detected' },
  { pattern: /clear/i, reason: 'Clear action detected' },
  { pattern: /uninstall/i, reason: 'Uninstall action detected' },
  { pattern: /terminate/i, reason: 'Terminate action detected' },
  { pattern: /kill/i, reason: 'Kill action detected' },
];

// ─── Computer Use Overlay Manager ─────────────────────────────────────────────

export class ComputerUseOverlayManager extends EventEmitter {
  private state: OverlayState = 'hidden';
  private recording: ComputerUseAction[] = [];
  private currentAction: ComputerUseAction | null = null;
  private highlights: HighlightRegion[] = [];
  private transparency = 0.7;
  private screenshotData: ScreenshotData | null = null;
  private pendingConfirmation: {
    action: ComputerUseAction;
    resolve: (approved: boolean) => void;
  } | null = null;
  private replayAbortController: AbortController | null = null;

  constructor() {
    super();
  }

  // ─── Overlay Control ───────────────────────────────────────────────────────

  /**
   * Show the overlay window.
   */
  showOverlay(): void {
    if (this.state !== 'hidden') return;

    this.state = 'showing';
    this.emit('overlay:shown');
    this.emit('state:changed', this.state);
  }

  /**
   * Hide the overlay window.
   */
  hideOverlay(): void {
    if (this.state === 'recording') {
      this.stopRecording();
    }

    this.state = 'hidden';
    this.highlights = [];
    this.currentAction = null;
    this.emit('overlay:hidden');
    this.emit('state:changed', this.state);
  }

  /**
   * Get the current overlay state.
   */
  getState(): OverlayState {
    return this.state;
  }

  /**
   * Set the overlay transparency level (0 = invisible, 1 = opaque).
   */
  setTransparency(level: number): void {
    this.transparency = Math.max(0, Math.min(1, level));
    this.emit('transparency:changed', this.transparency);
  }

  /**
   * Get the current transparency level.
   */
  getTransparency(): number {
    return this.transparency;
  }

  // ─── Recording ─────────────────────────────────────────────────────────────

  /**
   * Start recording actions.
   */
  startRecording(): void {
    if (this.state === 'recording') return;

    this.state = 'recording';
    this.recording = [];
    this.emit('recording:started');
    this.emit('state:changed', this.state);
  }

  /**
   * Stop recording actions.
   */
  stopRecording(): void {
    if (this.state !== 'recording' && this.state !== 'paused') return;

    this.state = 'showing';
    this.emit('recording:stopped', [...this.recording]);
    this.emit('state:changed', this.state);
  }

  /**
   * Pause the current recording.
   */
  pauseRecording(): void {
    if (this.state !== 'recording') return;

    this.state = 'paused';
    this.emit('recording:paused');
    this.emit('state:changed', this.state);
  }

  /**
   * Resume a paused recording.
   */
  resumeRecording(): void {
    if (this.state !== 'paused') return;

    this.state = 'recording';
    this.emit('recording:resumed');
    this.emit('state:changed', this.state);
  }

  /**
   * Get all recorded actions.
   */
  getRecording(): ComputerUseAction[] {
    return [...this.recording];
  }

  /**
   * Clear the recording buffer.
   */
  clearRecording(): void {
    this.recording = [];
    this.emit('recording:cleared');
  }

  // ─── Screenshot ────────────────────────────────────────────────────────────

  /**
   * Capture a screenshot.
   * In production, this would use Electron's desktopCapturer or native APIs.
   */
  async captureScreenshot(): Promise<Buffer> {
    // Simulated screenshot capture
    // In production, this would:
    // 1. Use desktopCapturer to get the screen source
    // 2. Convert to Buffer
    // 3. Store dimensions and annotations

    const screenshotAction: ComputerUseAction = {
      id: this.generateActionId(),
      type: 'screenshot',
      timestamp: new Date().toISOString(),
    };

    this.recordAction(screenshotAction);

    // Create a placeholder buffer
    // In production, this would be the actual PNG/JPEG data
    const placeholderBuffer = Buffer.from(
      `Screenshot captured at ${new Date().toISOString()}`,
      'utf-8',
    );

    this.screenshotData = {
      buffer: placeholderBuffer,
      width: 1920,
      height: 1080,
      annotations: [...this.highlights],
      timestamp: new Date().toISOString(),
    };

    this.emit('screenshot:captured', this.screenshotData);

    return placeholderBuffer;
  }

  /**
   * Get the last screenshot data.
   */
  getScreenshotData(): ScreenshotData | null {
    return this.screenshotData;
  }

  // ─── Highlighting ──────────────────────────────────────────────────────────

  /**
   * Highlight a screen region.
   */
  highlightRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    label?: string,
  ): void {
    const region: HighlightRegion = {
      x,
      y,
      width,
      height,
      label,
      color: '#ef4444',
      opacity: 0.3,
    };

    this.highlights.push(region);
    this.emit('region:highlighted', region);
  }

  /**
   * Clear all highlighted regions.
   */
  clearHighlights(): void {
    this.highlights = [];
    this.emit('highlights:cleared');
  }

  /**
   * Get all current highlights.
   */
  getHighlights(): HighlightRegion[] {
    return [...this.highlights];
  }

  // ─── Action Display ────────────────────────────────────────────────────────

  /**
   * Display an action on the overlay.
   * Records the action if recording is active.
   */
  async showAction(action: ComputerUseAction): Promise<void> {
    this.currentAction = action;

    // Check for destructive action
    const safetyCheck = this.checkDestructiveAction(action);
    if (safetyCheck.isDestructive) {
      const approved = await this.requestConfirmation(action, safetyCheck);
      if (!approved) {
        this.emit('action:cancelled', action);
        this.currentAction = null;
        return;
      }
    }

    // Record if recording
    if (this.state === 'recording') {
      this.recordAction(action);
    }

    this.emit('action:shown', action);
    this.emit('action:executed', action);

    // Auto-clear current action after display
    setTimeout(() => {
      if (this.currentAction?.id === action.id) {
        this.currentAction = null;
      }
    }, 2000);
  }

  /**
   * Convenience: Create and show a click action.
   */
  async click(x: number, y: number, label?: string): Promise<void> {
    const action: ComputerUseAction = {
      id: this.generateActionId(),
      type: 'click',
      coordinates: { x, y },
      timestamp: new Date().toISOString(),
      metadata: label ? { label } : undefined,
    };

    this.highlightRegion(x - 10, y - 10, 20, 20, label);
    await this.showAction(action);
  }

  /**
   * Convenience: Create and show a type action.
   */
  async type(text: string, x?: number, y?: number): Promise<void> {
    const action: ComputerUseAction = {
      id: this.generateActionId(),
      type: 'type',
      text,
      coordinates: x !== undefined && y !== undefined ? { x, y } : undefined,
      timestamp: new Date().toISOString(),
    };

    await this.showAction(action);
  }

  /**
   * Convenience: Create and show a scroll action.
   */
  async scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount = 3): Promise<void> {
    const action: ComputerUseAction = {
      id: this.generateActionId(),
      type: 'scroll',
      coordinates: { x, y },
      duration: amount,
      timestamp: new Date().toISOString(),
      metadata: { direction, amount },
    };

    await this.showAction(action);
  }

  /**
   * Convenience: Create and show a drag action.
   */
  async drag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    duration = 500,
  ): Promise<void> {
    const action: ComputerUseAction = {
      id: this.generateActionId(),
      type: 'drag',
      coordinates: { x: fromX, y: fromY },
      duration,
      timestamp: new Date().toISOString(),
      metadata: { toX, toY, fromX, fromY },
    };

    // Highlight both from and to regions
    this.highlightRegion(fromX - 5, fromY - 5, 10, 10, 'from');
    this.highlightRegion(toX - 5, toY - 5, 10, 10, 'to');

    await this.showAction(action);
  }

  // ─── Safety ────────────────────────────────────────────────────────────────

  /**
   * Check if an action is potentially destructive.
   */
  checkDestructiveAction(action: ComputerUseAction): DestructiveActionCheck {
    // Check action text for destructive patterns
    const textToCheck = [
      action.text || '',
      (action.metadata?.label as string) || '',
      (action.metadata?.direction as string) || '',
    ].join(' ');

    for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(textToCheck)) {
        return {
          isDestructive: true,
          category: 'destructive',
          reason,
        };
      }
    }

    // Click actions on certain regions might be moderate risk
    if (action.type === 'click' && action.coordinates) {
      // Check if clicking near bottom of screen (common for destructive buttons)
      if (action.coordinates.y > 900) {
        return {
          isDestructive: false,
          category: 'moderate',
          reason: 'Click in lower screen region',
        };
      }
    }

    return {
      isDestructive: false,
      category: 'safe',
    };
  }

  /**
   * Request user confirmation for a potentially destructive action.
   * Returns a promise that resolves with the user's decision.
   */
  private async requestConfirmation(
    action: ComputerUseAction,
    check: DestructiveActionCheck,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingConfirmation = {
        action,
        resolve,
      };

      this.emit('confirmation:requested', {
        action,
        check,
      });
    });
  }

  /**
   * Respond to a pending confirmation request.
   */
  resolveConfirmation(approved: boolean): void {
    if (this.pendingConfirmation) {
      this.pendingConfirmation.resolve(approved);
      this.pendingConfirmation = null;
      this.emit('confirmation:resolved', approved);
    }
  }

  /**
   * Check if there's a pending confirmation.
   */
  hasPendingConfirmation(): boolean {
    return this.pendingConfirmation !== null;
  }

  // ─── Action Replay ─────────────────────────────────────────────────────────

  /**
   * Replay recorded actions.
   */
  async replay(actions: ComputerUseAction[], options?: Partial<ReplayOptions>): Promise<void> {
    const replayOptions: ReplayOptions = {
      speed: options?.speed || 1,
      delay: options?.delay || 500,
      onAction: options?.onAction,
    };

    this.replayAbortController = new AbortController();
    const signal = this.replayAbortController.signal;

    this.emit('replay:started', { actionCount: actions.length });

    for (let i = 0; i < actions.length; i++) {
      if (signal.aborted) {
        this.emit('replay:aborted');
        return;
      }

      const action = actions[i];
      await this.showAction(action);

      if (replayOptions.onAction) {
        replayOptions.onAction(action, i);
      }

      this.emit('replay:action', { action, index: i, total: actions.length });

      // Wait between actions
      const delay = replayOptions.delay / replayOptions.speed;
      await this.sleep(delay, signal);
    }

    this.replayAbortController = null;
    this.emit('replay:completed');
  }

  /**
   * Abort a running replay.
   */
  abortReplay(): void {
    if (this.replayAbortController) {
      this.replayAbortController.abort();
      this.replayAbortController = null;
    }
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /**
   * Get the currently displayed action.
   */
  getCurrentAction(): ComputerUseAction | null {
    return this.currentAction;
  }

  /**
   * Get action statistics.
   */
  getRecordingStats(): {
    totalActions: number;
    byType: Record<string, number>;
    duration: number;
  } {
    const byType: Record<string, number> = {};
    for (const action of this.recording) {
      byType[action.type] = (byType[action.type] || 0) + 1;
    }

    const duration =
      this.recording.length >= 2
        ? new Date(this.recording[this.recording.length - 1].timestamp).getTime() -
          new Date(this.recording[0].timestamp).getTime()
        : 0;

    return {
      totalActions: this.recording.length,
      byType,
      duration,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private generateActionId(): string {
    return `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private recordAction(action: ComputerUseAction): void {
    this.recording.push(action);
    this.emit('action:recorded', action);
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        });
      }
    });
  }
}
