/**
 * OpenAgent-Desktop - Recipe System
 * Barrel export for all recipe modules, plus facade RecipeEngine
 */

import { EventEmitter } from "events";

// Re-export all types from recipe-store
export type {
  RecipeVariable,
  RecipeSettings,
  Recipe,
  SubRecipeRef,
  RecipeSchedule,
  RecipeRun,
  RecipeStep,
  RecipeResult,
} from './recipe-store';

export interface RecipeEngineOptions {
  recipesDir: string;
  traceCollector?: any;
  extensionRegistry?: any;
  providerManager?: any;
  sandboxManager?: any;
  hookManager?: any;
}

// ─── Sub-Modules ───────────────────────────────────────────────────────────────

import { RecipeStore } from './recipe-store';
import { RecipeExecutor } from './recipe-executor';
import { RecipeSharing } from './recipe-sharing';

export { RecipeStore } from './recipe-store';
export { RecipeExecutor } from './recipe-executor';
export { RecipeSharing } from './recipe-sharing';

// ─── RecipeEngine Facade ───────────────────────────────────────────────────────

export class RecipeEngine extends EventEmitter {
  private store: RecipeStore;
  private executor: RecipeExecutor;
  private sharing: RecipeSharing;
  private initialized = false;

  constructor(options: RecipeEngineOptions) {
    super();

    this.store = new RecipeStore({
      recipesDir: options.recipesDir,
      traceCollector: options.traceCollector,
    });

    this.executor = new RecipeExecutor({
      providerManager: options.providerManager,
      hookManager: options.hookManager,
      traceCollector: options.traceCollector,
      store: this.store,
    });

    this.sharing = new RecipeSharing(this.store);

    // Forward store events
    this.store.on("recipe:created", (recipe: any) => this.emit("recipe:created", recipe));
    this.store.on("recipe:deleted", (id: any) => this.emit("recipe:deleted", id));
    this.store.on("recipe:run-started", (data: any) => this.emit("recipe:run-started", data));
    this.store.on("recipe:run-completed", (data: any) => this.emit("recipe:run-completed", data));
    this.store.on("recipe:run-failed", (data: any) => this.emit("recipe:run-failed", data));
    this.store.on("recipe:run-cancelled", (data: any) => this.emit("recipe:run-cancelled", data));
    this.store.on("schedule:run", (recipeId: string, vars: any) => {
      // When the store fires a scheduled run event, execute it
      this.run(recipeId, vars);
    });
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.store.initialize();
    this.initialized = true;
    console.info(
      `[RecipeEngine] Initialized with ${this.store.getRecipeCount()} recipes`
    );
  }

  // ─── CRUD Operations (delegated to store) ──────────────────────────────────

  async list(): Promise<any[]> {
    return this.store.list();
  }

  async get(recipeId: string): Promise<any | undefined> {
    return this.store.get(recipeId);
  }

  async create(recipeData: Partial<any> & { name: string; prompt: string }): Promise<any> {
    return this.store.create(recipeData);
  }

  async delete(recipeId: string): Promise<void> {
    return this.store.delete(recipeId);
  }

  // ─── Import / Sharing (delegated to sharing) ──────────────────────────────

  async importFromSource(source: string, format?: string): Promise<any> {
    return this.sharing.importFromSource(source, format);
  }

  async importRecipe(recipeData: Partial<any>): Promise<any> {
    return this.sharing.importRecipe(recipeData);
  }

  generateShareUrl(recipeId: string, baseUrl?: string): string {
    return this.sharing.generateShareUrl(recipeId, baseUrl);
  }

  // ─── Execution (delegated to executor) ─────────────────────────────────────

  async run(recipeId: string, variables?: Record<string, string>): Promise<any> {
    return this.executor.run(recipeId, variables);
  }

  async cancelRun(runId: string): Promise<void> {
    return this.executor.cancelRun(runId);
  }

  // ─── Slash Commands (delegated to store) ───────────────────────────────────

  async getRecipeBySlashCommand(command: string): Promise<any | undefined> {
    return this.store.getRecipeBySlashCommand(command);
  }

  getSlashCommands(): Map<string, string> {
    return this.store.getSlashCommands();
  }

  // ─── Run History (delegated to store) ──────────────────────────────────────

  async getRunHistory(recipeId: string, limit?: number): Promise<any[]> {
    return this.store.getRunHistory(recipeId, limit);
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  getActiveRunCount(): number {
    return this.store.getActiveRunCount();
  }

  getRecipeCount(): number {
    return this.store.getRecipeCount();
  }

  getActiveRuns(): any[] {
    return this.store.getActiveRuns();
  }

  // ─── Shutdown ────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    // Cancel active runs
    for (const run of this.store.getActiveRuns()) {
      await this.cancelRun(run.id);
    }

    await this.store.shutdown();
    this.initialized = false;

    console.info("[RecipeEngine] Shut down");
  }
}
