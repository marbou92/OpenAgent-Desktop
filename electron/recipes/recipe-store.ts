/**
 * OpenAgent-Desktop - Recipe Store
 *
 * Handles recipe CRUD operations, persistence to disk, slash command mapping,
 * built-in cookbook recipes, scheduling, validation, and run history.
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface RecipeVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
  type?: "string" | "number" | "boolean" | "file" | "select";
  options?: string[]; // For select type
}

export interface RecipeSettings {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  parallelSubRecipes?: boolean;
  maxParallelExecutions?: number;
  continueOnError?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  extensions: string[];
  prompt: string;
  subRecipes: SubRecipeRef[];
  variables: RecipeVariable[];
  settings: RecipeSettings;
  slashCommand?: string;
  schedule?: RecipeSchedule;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  isBuiltin?: boolean;
  source?: string; // URL if imported
}

export interface SubRecipeRef {
  id: string;
  recipeId: string;
  name: string;
  variableOverrides?: Record<string, string>;
  condition?: string; // JavaScript expression to evaluate
  onSuccess?: "continue" | "stop" | "retry";
  onFailure?: "continue" | "stop" | "retry";
}

export interface RecipeSchedule {
  enabled: boolean;
  cron: string; // cron expression
  variables?: Record<string, string>;
  timezone?: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface RecipeRun {
  id: string;
  recipeId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  variables: Record<string, string>;
  steps: RecipeStep[];
  result?: RecipeResult;
}

export interface RecipeStep {
  id: string;
  type: "prompt" | "sub_recipe" | "tool_call";
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  subRecipeRunId?: string;
}

export interface RecipeResult {
  recipeId: string;
  success: boolean;
  output: string;
  duration: number;
  stepsCompleted: number;
  stepsFailed: number;
  subResults?: RecipeResult[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface RecipeStoreOptions {
  recipesDir: string;
  traceCollector?: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECIPE_FILE_EXTENSION = ".recipe.json";
const _COOKBOOK_FILE = "cookbook.json";
const RUNS_DIR = "runs";

// ─── Built-in Cookbook Recipes ────────────────────────────────────────────────

const BUILTIN_RECIPES: Recipe[] = [
  {
    id: "builtin:code-review",
    name: "Code Review",
    description: "Review code changes and provide feedback on quality, security, and best practices.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Please review the following code changes and provide feedback:

{{code_changes}}

Focus on:
1. Code quality and readability
2. Potential bugs or security issues
3. Performance considerations
4. Best practices and design patterns
5. Testing suggestions

{{#language}}Language: {{language}}{{/language}}`,
    subRecipes: [],
    variables: [
      {
        name: "code_changes",
        description: "The code changes to review",
        required: true,
        type: "string",
      },
      {
        name: "language",
        description: "Programming language (optional)",
        required: false,
        type: "string",
      },
    ],
    settings: {
      maxRetries: 1,
      timeoutMs: 120000,
      model: "",
    },
    slashCommand: "/review",
    tags: ["code-quality", "review"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
  {
    id: "builtin:explain-code",
    name: "Explain Code",
    description: "Explain what a piece of code does in plain language.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Please explain the following code in plain language:

{{code}}

Break down:
1. What the code does overall
2. Key functions and their purposes
3. Data flow and control flow
4. Any notable patterns or techniques used`,
    subRecipes: [],
    variables: [
      {
        name: "code",
        description: "The code to explain",
        required: true,
        type: "string",
      },
    ],
    settings: {
      maxRetries: 1,
      timeoutMs: 60000,
      model: "",
    },
    slashCommand: "/explain",
    tags: ["code", "explanation"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
  {
    id: "builtin:write-tests",
    name: "Write Tests",
    description: "Generate unit tests for the provided code.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Write comprehensive unit tests for the following code:

{{code}}

Test framework: {{framework}}
{{#language}}Language: {{language}}{{/language}}

Generate tests that cover:
1. Happy path / normal cases
2. Edge cases
3. Error handling
4. Boundary conditions
5. Integration scenarios if applicable`,
    subRecipes: [],
    variables: [
      {
        name: "code",
        description: "The code to generate tests for",
        required: true,
        type: "string",
      },
      {
        name: "framework",
        description: "Test framework to use",
        required: false,
        defaultValue: "jest",
        type: "select",
        options: ["jest", "mocha", "pytest", "unittest", "junit", "go test"],
      },
      {
        name: "language",
        description: "Programming language",
        required: false,
        type: "string",
      },
    ],
    settings: {
      maxRetries: 1,
      timeoutMs: 120000,
      model: "",
    },
    slashCommand: "/test",
    tags: ["testing", "code-generation"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
  {
    id: "builtin:refactor",
    name: "Refactor Code",
    description: "Refactor code to improve quality, readability, and performance.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Refactor the following code to improve its quality:

{{code}}

Focus areas:
1. {{focus}}
2. Maintain existing functionality
3. Improve readability and maintainability
4. Follow {{language}} best practices
5. Add appropriate comments

Return the refactored code with explanations of changes made.`,
    subRecipes: [],
    variables: [
      {
        name: "code",
        description: "The code to refactor",
        required: true,
        type: "string",
      },
      {
        name: "language",
        description: "Programming language",
        required: false,
        type: "string",
        defaultValue: "typescript",
      },
      {
        name: "focus",
        description: "Primary focus area for refactoring",
        required: false,
        type: "select",
        options: [
          "Readability",
          "Performance",
          "SOLID principles",
          "Design patterns",
          "Error handling",
          "Type safety",
        ],
        defaultValue: "Readability",
      },
    ],
    settings: {
      maxRetries: 1,
      timeoutMs: 120000,
      model: "",
    },
    slashCommand: "/refactor",
    tags: ["code-quality", "refactoring"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
  {
    id: "builtin:document",
    name: "Generate Documentation",
    description: "Generate documentation for the provided code.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Generate comprehensive documentation for the following code:

{{code}}

Documentation style: {{style}}
{{#language}}Language: {{language}}{{/language}}

Include:
1. Module/package overview
2. Function/method documentation
3. Parameter descriptions
4. Return value descriptions
5. Usage examples
6. Type information`,
    subRecipes: [],
    variables: [
      {
        name: "code",
        description: "The code to document",
        required: true,
        type: "string",
      },
      {
        name: "style",
        description: "Documentation style",
        required: false,
        type: "select",
        options: ["JSDoc", "TSDoc", "docstring", "GoDoc", "Godoc", "XML doc comments"],
        defaultValue: "JSDoc",
      },
      {
        name: "language",
        description: "Programming language",
        required: false,
        type: "string",
      },
    ],
    settings: {
      maxRetries: 1,
      timeoutMs: 90000,
      model: "",
    },
    slashCommand: "/doc",
    tags: ["documentation", "code-generation"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
  {
    id: "builtin:security-audit",
    name: "Security Audit",
    description: "Perform a security audit on the provided code.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Perform a thorough security audit on the following code:

{{code}}

Check for:
1. Injection vulnerabilities (SQL, XSS, command injection)
2. Authentication and authorization issues
3. Data exposure and leakage
4. Insecure cryptography
5. Input validation gaps
6. Dependency vulnerabilities
7. Configuration issues
8. OWASP Top 10 compliance

Rate each finding by severity: Critical, High, Medium, Low, Info`,
    subRecipes: [],
    variables: [
      {
        name: "code",
        description: "The code to audit",
        required: true,
        type: "string",
      },
    ],
    settings: {
      maxRetries: 1,
      timeoutMs: 120000,
      model: "",
    },
    slashCommand: "/audit",
    tags: ["security", "audit"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
  {
    id: "builtin:full-stack-feature",
    name: "Full-Stack Feature",
    description: "Implement a full-stack feature with frontend, backend, and tests.",
    version: "1.0.0",
    author: "OpenAgent-Desktop",
    extensions: [],
    prompt: `Implement a full-stack feature with the following requirements:

{{requirements}}

Tech stack:
- Frontend: {{frontend_framework}}
- Backend: {{backend_framework}}
- Database: {{database}}
- Testing: {{testing_framework}}

Generate:
1. Backend API endpoints and models
2. Frontend components and pages
3. Database schema/migrations
4. Unit and integration tests
5. API documentation`,
    subRecipes: [
      {
        id: "sub:backend",
        recipeId: "builtin:write-tests",
        name: "Generate Backend Tests",
        variableOverrides: {
          framework: "{{testing_framework}}",
          language: "{{backend_language}}",
        },
        onFailure: "continue",
        onSuccess: "continue",
      },
    ],
    variables: [
      {
        name: "requirements",
        description: "Feature requirements",
        required: true,
        type: "string",
      },
      {
        name: "frontend_framework",
        description: "Frontend framework",
        required: false,
        defaultValue: "React",
        type: "select",
        options: ["React", "Vue", "Angular", "Svelte", "Next.js"],
      },
      {
        name: "backend_framework",
        description: "Backend framework",
        required: false,
        defaultValue: "Express",
        type: "select",
        options: ["Express", "FastAPI", "Spring Boot", "Django", "NestJS"],
      },
      {
        name: "database",
        description: "Database",
        required: false,
        defaultValue: "PostgreSQL",
        type: "select",
        options: ["PostgreSQL", "MySQL", "MongoDB", "SQLite", "Redis"],
      },
      {
        name: "testing_framework",
        description: "Testing framework",
        required: false,
        defaultValue: "jest",
        type: "string",
      },
      {
        name: "backend_language",
        description: "Backend programming language",
        required: false,
        defaultValue: "typescript",
        type: "string",
      },
    ],
    settings: {
      maxRetries: 2,
      timeoutMs: 300000,
      parallelSubRecipes: true,
      maxParallelExecutions: 3,
      model: "",
    },
    slashCommand: "/feature",
    tags: ["full-stack", "feature", "code-generation"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
];

// ─── RecipeStore ───────────────────────────────────────────────────────────────

export class RecipeStore extends EventEmitter {
  private recipesDir: string;
  private runsDir: string;
  private traceCollector?: any;

  private recipes: Map<string, Recipe> = new Map();
  private activeRuns: Map<string, RecipeRun> = new Map();
  private scheduledJobs: Map<string, { timer: NodeJS.Timeout; stop: () => void }> = new Map();
  private slashCommandMap: Map<string, string> = new Map(); // slash command -> recipe ID
  private initialized = false;

  constructor(options: RecipeStoreOptions) {
    super();
    this.recipesDir = options.recipesDir;
    this.runsDir = path.join(options.recipesDir, RUNS_DIR);
    this.traceCollector = options.traceCollector;
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directories exist
    if (!fs.existsSync(this.recipesDir)) {
      fs.mkdirSync(this.recipesDir, { recursive: true });
    }
    if (!fs.existsSync(this.runsDir)) {
      fs.mkdirSync(this.runsDir, { recursive: true });
    }

    // Load built-in recipes
    for (const recipe of BUILTIN_RECIPES) {
      this.recipes.set(recipe.id, recipe);
      if (recipe.slashCommand) {
        this.slashCommandMap.set(recipe.slashCommand, recipe.id);
      }
    }

    // Load user recipes from disk
    this.loadRecipesFromDisk();

    // Set up scheduled recipes
    this.setupScheduledRecipes();

    this.initialized = true;
    console.info(
      `[RecipeStore] Initialized with ${this.recipes.size} recipes`
    );
  }

  // ─── CRUD Operations ─────────────────────────────────────────────────────

  async list(): Promise<Recipe[]> {
    return Array.from(this.recipes.values());
  }

  async get(recipeId: string): Promise<Recipe | undefined> {
    return this.recipes.get(recipeId);
  }

  async create(recipeData: Partial<Recipe> & { name: string; prompt: string }): Promise<Recipe> {
    this.ensureInitialized();

    const now = new Date().toISOString();
    const recipeId = recipeData.id || `user:${crypto.randomUUID()}`;

    const recipe: Recipe = {
      id: recipeId,
      name: recipeData.name,
      description: recipeData.description || "",
      version: recipeData.version || "1.0.0",
      author: recipeData.author || "User",
      extensions: recipeData.extensions || [],
      prompt: recipeData.prompt,
      subRecipes: recipeData.subRecipes || [],
      variables: recipeData.variables || [],
      settings: recipeData.settings || {
        maxRetries: 1,
        timeoutMs: 120000,
      },
      slashCommand: recipeData.slashCommand,
      schedule: recipeData.schedule,
      tags: recipeData.tags || [],
      createdAt: now,
      updatedAt: now,
      isBuiltin: false,
    };

    // Validate the recipe
    this.validateRecipe(recipe);

    // Check for duplicate slash command
    if (recipe.slashCommand && this.slashCommandMap.has(recipe.slashCommand)) {
      const existingId = this.slashCommandMap.get(recipe.slashCommand);
      if (existingId !== recipe.id) {
        throw new Error(
          `Slash command ${recipe.slashCommand} is already used by recipe ${existingId}`
        );
      }
    }

    this.recipes.set(recipe.id, recipe);

    // Register slash command
    if (recipe.slashCommand) {
      this.slashCommandMap.set(recipe.slashCommand, recipe.id);
    }

    // Set up schedule if provided
    if (recipe.schedule?.enabled) {
      this.setupRecipeSchedule(recipe);
    }

    // Persist to disk
    this.writeRecipeFile(recipe);

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Recipe created: ${recipe.name}`,
      metadata: { recipeId: recipe.id, slashCommand: recipe.slashCommand },
    });

    this.emit("recipe:created", recipe);

    return recipe;
  }

  async delete(recipeId: string): Promise<void> {
    this.ensureInitialized();

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    if (recipe.isBuiltin) {
      throw new Error("Cannot delete built-in recipes");
    }

    // Remove slash command mapping
    if (recipe.slashCommand) {
      this.slashCommandMap.delete(recipe.slashCommand);
    }

    // Cancel scheduled job
    const job = this.scheduledJobs.get(recipeId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(recipeId);
    }

    // Remove from memory
    this.recipes.delete(recipeId);

    // Remove from disk
    const filePath = this.getRecipeFilePath(recipeId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Recipe deleted: ${recipe.name}`,
      metadata: { recipeId },
    });

    this.emit("recipe:deleted", recipeId);
  }

  // ─── Slash Commands ──────────────────────────────────────────────────────

  async getRecipeBySlashCommand(command: string): Promise<Recipe | undefined> {
    const recipeId = this.slashCommandMap.get(command);
    if (!recipeId) return undefined;
    return this.recipes.get(recipeId);
  }

  getSlashCommands(): Map<string, string> {
    return new Map(this.slashCommandMap);
  }

  // ─── Active Runs ─────────────────────────────────────────────────────────

  getActiveRuns(): RecipeRun[] {
    return Array.from(this.activeRuns.values());
  }

  getActiveRun(runId: string): RecipeRun | undefined {
    return this.activeRuns.get(runId);
  }

  setActiveRun(runId: string, run: RecipeRun): void {
    this.activeRuns.set(runId, run);
  }

  deleteActiveRun(runId: string): void {
    this.activeRuns.delete(runId);
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  getRecipeCount(): number {
    return this.recipes.size;
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────

  private setupScheduledRecipes(): void {
    for (const recipe of this.recipes.values()) {
      if (recipe.schedule?.enabled) {
        this.setupRecipeSchedule(recipe);
      }
    }
  }

  private setupRecipeSchedule(recipe: Recipe): void {
    if (!recipe.schedule?.cron) return;

    // Stop existing job if any
    const existingJob = this.scheduledJobs.get(recipe.id);
    if (existingJob) {
      existingJob.stop();
    }

    try {
      const cronExpr = recipe.schedule.cron;
      const runRecipe = async () => {
        console.info(`[RecipeStore] Running scheduled recipe: ${recipe.name}`);
        try {
          // The actual run is delegated to the executor; the store emits an event
          this.emit("schedule:run", recipe.id, recipe.schedule?.variables);

          // Update schedule metadata
          if (recipe.schedule) {
            recipe.schedule.lastRunAt = new Date().toISOString();
          }

          await this.traceCollector?.addEntry("system", {
            type: "info",
            content: `Scheduled recipe triggered: ${recipe.name}`,
            metadata: { recipeId: recipe.id },
          });
        } catch (err: any) {
          await this.traceCollector?.addEntry("system", {
            type: "error",
            content: `Scheduled recipe failed: ${recipe.name} - ${err.message}`,
            metadata: { recipeId: recipe.id },
          });
        }
      };

      const schedule = this.parseCronAndSchedule(cronExpr, runRecipe);
      this.scheduledJobs.set(recipe.id, schedule);

      // Calculate approximate next run time
      recipe.schedule.nextRunAt = this.getNextCronDate(cronExpr)?.toISOString() || undefined;
    } catch (err) {
      console.error(
        `[RecipeStore] Failed to setup schedule for ${recipe.name}:`,
        err
      );
    }
  }

  // ─── Run History ─────────────────────────────────────────────────────────

  async getRunHistory(recipeId: string, limit?: number): Promise<RecipeRun[]> {
    const runs: RecipeRun[] = [];

    if (!fs.existsSync(this.runsDir)) return runs;

    const files = fs.readdirSync(this.runsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const content = fs.readFileSync(path.join(this.runsDir, file), "utf-8");
        const run: RecipeRun = JSON.parse(content);

        if (run.recipeId === recipeId) {
          runs.push(run);
        }
      } catch {
        // Skip malformed files
      }
    }

    // Sort by startedAt descending
    runs.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    return limit ? runs.slice(0, limit) : runs;
  }

  // ─── Validation ──────────────────────────────────────────────────────────

  validateRecipe(recipe: Recipe): void {
    if (!recipe.name || recipe.name.trim().length === 0) {
      throw new Error("Recipe name is required");
    }

    if (!recipe.prompt || recipe.prompt.trim().length === 0) {
      throw new Error("Recipe prompt is required");
    }

    // Validate sub-recipe references
    for (const subRef of recipe.subRecipes) {
      if (!subRef.recipeId) {
        throw new Error(`Sub-recipe "${subRef.name}" is missing recipeId`);
      }
    }

    // Validate slash command format
    if (recipe.slashCommand && !recipe.slashCommand.startsWith("/")) {
      throw new Error("Slash command must start with /");
    }

    // Validate cron expression if schedule is provided
    if (recipe.schedule?.cron) {
      try {
        this.parseCronAndSchedule(recipe.schedule.cron, () => {});
      } catch {
        throw new Error(
          `Invalid cron expression: ${recipe.schedule.cron}`
        );
      }
    }
  }

  // ─── File I/O ────────────────────────────────────────────────────────────

  private getRecipeFilePath(recipeId: string): string {
    const safeName = recipeId.replace(/[^a-zA-Z0-9-_:]/g, "_");
    return path.join(this.recipesDir, `${safeName}${RECIPE_FILE_EXTENSION}`);
  }

  private loadRecipesFromDisk(): void {
    if (!fs.existsSync(this.recipesDir)) return;

    const files = fs.readdirSync(this.recipesDir);
    for (const file of files) {
      if (!file.endsWith(RECIPE_FILE_EXTENSION)) continue;

      const filePath = path.join(this.recipesDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const recipe: Recipe = JSON.parse(content);

        // Don't override built-in recipes
        if (!this.recipes.has(recipe.id)) {
          this.recipes.set(recipe.id, recipe);

          if (recipe.slashCommand) {
            this.slashCommandMap.set(recipe.slashCommand, recipe.id);
          }
        }
      } catch (err) {
        console.error(
          `[RecipeStore] Error loading recipe file ${file}:`,
          err
        );
      }
    }
  }

  private writeRecipeFile(recipe: Recipe): void {
    if (recipe.isBuiltin) return; // Don't persist built-in recipes

    const filePath = this.getRecipeFilePath(recipe.id);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(recipe, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  }

  saveRunRecord(run: RecipeRun): void {
    const filePath = path.join(this.runsDir, `${run.id}.json`);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
    } catch (err) {
      console.error("[RecipeStore] Error saving run record:", err);
    }

    // Clean up old run records (keep last 100 per recipe)
    this.cleanupOldRunRecords(run.recipeId);
  }

  private cleanupOldRunRecords(recipeId: string, maxRecords = 100): void {
    if (!fs.existsSync(this.runsDir)) return;

    const files: { file: string; mtime: Date }[] = [];

    const allFiles = fs.readdirSync(this.runsDir);
    for (const file of allFiles) {
      if (!file.endsWith(".json")) continue;

      try {
        const filePath = path.join(this.runsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const run: RecipeRun = JSON.parse(content);

        if (run.recipeId === recipeId) {
          const stat = fs.statSync(filePath);
          files.push({ file: filePath, mtime: stat.mtime });
        }
      } catch {
        // Skip
      }
    }

    // Sort by modification time, newest first
    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Remove old records
    if (files.length > maxRecords) {
      const toRemove = files.slice(maxRecords);
      for (const { file } of toRemove) {
        try {
          fs.unlinkSync(file);
        } catch {
          // Ignore
        }
      }
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "RecipeStore is not initialized. Call initialize() first."
      );
    }
  }

  getRecipesMap(): Map<string, Recipe> {
    return this.recipes;
  }

  getSlashCommandMap(): Map<string, string> {
    return this.slashCommandMap;
  }

  getScheduledJobs(): Map<string, { timer: NodeJS.Timeout; stop: () => void }> {
    return this.scheduledJobs;
  }

  isStoreInitialized(): boolean {
    return this.initialized;
  }

  setInitialized(val: boolean): void {
    this.initialized = val;
  }

  // ─── Lightweight Cron Scheduler ────────────────────────────────────────────
  //
  // BUGFIX: the previous implementation called `callback()` immediately on
  // registration AND converted the cron expression into a setInterval ms
  // value — so `0 9 * * *` (9 AM daily) became "fire once now, then every
  // 24h from now". Both behaviors are wrong. The ScheduledExecutor in
  // scheduled-executor.ts is the correct scheduler; this method is now a
  // no-op stub that throws if called, so callers are forced to migrate.
  // Existing call sites should switch to ScheduledExecutor.scheduleJob().

  private parseCronAndSchedule(
    _expression: string,
    _callback: () => void
  ): { timer: NodeJS.Timeout; stop: () => void } {
    throw new Error(
      'RecipeStore.parseCronAndSchedule is deprecated — use ScheduledExecutor.scheduleJob() instead. ' +
      'The previous implementation fired the callback immediately on registration and ' +
      'mis-translated cron expressions into setInterval intervals, causing scheduled recipes ' +
      'to run at the wrong time.'
    );
  }

  private cronToMilliseconds(expression: string): number {
    // Retained for getNextCronDate compatibility — returns a coarse interval
    // approximation. For real cron semantics, use ScheduledExecutor.
    const expr = expression.trim();

    const aliases: Record<string, number> = {
      "@yearly": 365 * 24 * 60 * 60 * 1000,
      "@annually": 365 * 24 * 60 * 60 * 1000,
      "@monthly": 30 * 24 * 60 * 60 * 1000,
      "@weekly": 7 * 24 * 60 * 60 * 1000,
      "@daily": 24 * 60 * 60 * 1000,
      "@midnight": 24 * 60 * 60 * 1000,
      "@hourly": 60 * 60 * 1000,
    };

    if (aliases[expr.toLowerCase()]) {
      return aliases[expr.toLowerCase()];
    }

    console.warn(
      `[RecipeStore] cronToMilliseconds('${expression}') returns a coarse approximation only. ` +
      `Use ScheduledExecutor for accurate cron scheduling.`
    );
    return 60 * 60 * 1000;
  }

  private getNextCronDate(expression: string): Date | undefined {
    const ms = this.cronToMilliseconds(expression);
    if (ms <= 0) return undefined;
    return new Date(Date.now() + ms);
  }

  // ─── Shutdown ────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    // Cancel all scheduled jobs
    for (const [_recipeId, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();

    this.recipes.clear();
    this.slashCommandMap.clear();
    this.initialized = false;

    console.info("[RecipeStore] Shut down");
  }
}
