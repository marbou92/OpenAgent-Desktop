/**
 * OpenAgent-Desktop - Recipe Engine
 *
 * Recipes are reusable workflows that define a sequence of AI interactions,
 * tool calls, and sub-recipes. They enable users to automate complex tasks
 * and share workflows with others.
 *
 * Features:
 * - Create, import, run, and delete recipes
 * - Sub-recipes: recipes can call other recipes
 * - Parallel sub-recipe execution
 * - Variable substitution in prompts
 * - Recipe sharing via URL (encode as base64 in hash)
 * - Slash commands: map /command to recipe
 * - Scheduled tasks (cron-like)
 * - Recipe cookbook: built-in collection of recipes
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
// Cron scheduling is implemented using a lightweight built-in scheduler
// instead of the 'cron' npm package, to avoid Vite bundling issues.

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

export interface RecipeEngineOptions {
  recipesDir: string;
  traceCollector?: any;
  extensionRegistry?: any;
  providerManager?: any;
  sandboxManager?: any;
  hookManager?: any;
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
    },
    slashCommand: "/feature",
    tags: ["full-stack", "feature", "code-generation"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: true,
  },
];

// ─── RecipeEngine ─────────────────────────────────────────────────────────────

export class RecipeEngine extends EventEmitter {
  private recipesDir: string;
  private runsDir: string;
  private traceCollector?: any;
  private extensionRegistry?: any;
  private providerManager?: any;
  private sandboxManager?: any;
  private hookManager?: any;

  private recipes: Map<string, Recipe> = new Map();
  private activeRuns: Map<string, RecipeRun> = new Map();
  private scheduledJobs: Map<string, { timer: NodeJS.Timeout; stop: () => void }> = new Map();
  private slashCommandMap: Map<string, string> = new Map(); // slash command -> recipe ID
  private initialized = false;

  constructor(options: RecipeEngineOptions) {
    super();

    this.recipesDir = options.recipesDir;
    this.runsDir = path.join(options.recipesDir, RUNS_DIR);
    this.traceCollector = options.traceCollector;
    this.extensionRegistry = options.extensionRegistry;
    this.providerManager = options.providerManager;
    this.sandboxManager = options.sandboxManager;
    this.hookManager = options.hookManager;
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
      `[RecipeEngine] Initialized with ${this.recipes.size} recipes`
    );
  }

  // ─── CRUD Operations ─────────────────────────────────────────────────────

  /**
   * List all recipes
   */
  async list(): Promise<Recipe[]> {
    return Array.from(this.recipes.values());
  }

  /**
   * Get a specific recipe by ID
   */
  async get(recipeId: string): Promise<Recipe | undefined> {
    return this.recipes.get(recipeId);
  }

  /**
   * Create a new recipe
   */
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

  /**
   * Delete a recipe
   */
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

  // ─── Import ──────────────────────────────────────────────────────────────

  /**
   * Import a recipe from a URL or JSON string
   */
  async importFromSource(
    source: string,
    _format?: string
  ): Promise<Recipe> {
    this.ensureInitialized();

    let recipeData: Partial<Recipe>;

    if (source.startsWith("http://") || source.startsWith("https://")) {
      // Import from URL
      recipeData = await this.fetchRecipeFromUrl(source);
    } else if (source.startsWith("openagent-desktop://")) {
      // Import from deep link (base64 encoded in hash)
      const url = new URL(source);
      const encodedData = url.hash.substring(1);
      const decoded = Buffer.from(encodedData, "base64").toString("utf-8");
      recipeData = JSON.parse(decoded);
    } else {
      // Import from JSON string
      recipeData = JSON.parse(source);
    }

    // Create the recipe with a new ID to avoid conflicts
    const imported = await this.create({
      ...recipeData,
      id: `imported:${crypto.randomUUID()}`,
      source: source.startsWith("http") ? source : undefined,
      name: recipeData.name || 'Imported Recipe',
      prompt: recipeData.prompt || '',
    });

    return imported;
  }

  /**
   * Import a recipe from an object (used by deep links)
   */
  async importRecipe(recipeData: Partial<Recipe>): Promise<Recipe> {
    return this.create({
      ...recipeData,
      id: `imported:${crypto.randomUUID()}`,
      name: recipeData.name || 'Imported Recipe',
      prompt: recipeData.prompt || '',
    });
  }

  /**
   * Generate a shareable URL for a recipe
   */
  generateShareUrl(recipeId: string, baseUrl?: string): string {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    // Strip internal fields
    const shareable = {
      name: recipe.name,
      description: recipe.description,
      version: recipe.version,
      prompt: recipe.prompt,
      variables: recipe.variables,
      subRecipes: recipe.subRecipes,
      settings: recipe.settings,
      extensions: recipe.extensions,
      tags: recipe.tags,
    };

    const encoded = Buffer.from(JSON.stringify(shareable)).toString("base64");
    const urlBase = baseUrl || "openagent-desktop://import-recipe";
    return `${urlBase}#data=${encoded}`;
  }

  /**
   * Fetch a recipe from a URL
   */
  private async fetchRecipeFromUrl(url: string): Promise<Partial<Recipe>> {
    return new Promise((resolve, reject) => {
      const requestModule = url.startsWith("https://") ? require("https") : require("http");

      requestModule.get(url, (res: any) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse recipe from URL: ${err}`));
          }
        });
        res.on("error", reject);
      }).on("error", reject);
    });
  }

  // ─── Recipe Execution ────────────────────────────────────────────────────

  /**
   * Run a recipe with the given variables
   */
  async run(
    recipeId: string,
    variables?: Record<string, string>
  ): Promise<RecipeResult> {
    this.ensureInitialized();

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    // Resolve and validate variables
    const resolvedVars = this.resolveVariables(recipe, variables);
    this.validateVariables(recipe, resolvedVars);

    // Create a run record
    const runId = crypto.randomUUID();
    const run: RecipeRun = {
      id: runId,
      recipeId,
      startedAt: new Date().toISOString(),
      status: "running",
      variables: resolvedVars,
      steps: [],
    };

    this.activeRuns.set(runId, run);

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Recipe run started: ${recipe.name}`,
      metadata: { runId, recipeId, variables: resolvedVars },
    });

    this.emit("recipe:run-started", { runId, recipeId });

    const startTime = Date.now();

    try {
      // Run PreSession hooks
      if (this.hookManager) {
        await this.hookManager.trigger("PreSession", {
          recipeId,
          runId,
          variables: resolvedVars,
        });
      }

      // Step 1: Substitute variables in the prompt
      const resolvedPrompt = this.substituteVariables(recipe.prompt, resolvedVars);

      // Step 2: Run the main prompt
      const mainStep: RecipeStep = {
        id: crypto.randomUUID(),
        type: "prompt",
        name: "Main prompt",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      run.steps.push(mainStep);

      let mainOutput = "";

      try {
        mainOutput = await this.executePrompt(resolvedPrompt, recipe.settings);

        mainStep.status = "completed";
        mainStep.completedAt = new Date().toISOString();
        mainStep.output = mainOutput.substring(0, 5000); // Limit stored output
      } catch (err: any) {
        mainStep.status = "failed";
        mainStep.completedAt = new Date().toISOString();
        mainStep.error = err.message;

        if (!recipe.settings.continueOnError) {
          throw err;
        }
      }

      // Step 3: Run sub-recipes
      if (recipe.subRecipes.length > 0) {
        if (recipe.settings.parallelSubRecipes) {
          await this.runSubRecipesParallel(
            run,
            recipe,
            resolvedVars,
            mainOutput
          );
        } else {
          await this.runSubRecipesSequential(
            run,
            recipe,
            resolvedVars,
            mainOutput
          );
        }
      }

      // Step 4: Run PostSession hooks
      if (this.hookManager) {
        await this.hookManager.trigger("PostSession", {
          recipeId,
          runId,
          result: mainOutput,
        });
      }

      // Finalize the run
      const completedSteps = run.steps.filter((s) => s.status === "completed").length;
      const failedSteps = run.steps.filter((s) => s.status === "failed").length;

      const result: RecipeResult = {
        recipeId,
        success: failedSteps === 0,
        output: mainOutput,
        duration: Date.now() - startTime,
        stepsCompleted: completedSteps,
        stepsFailed: failedSteps,
      };

      run.result = result;
      run.status = failedSteps === 0 ? "completed" : "failed";
      run.completedAt = new Date().toISOString();

      await this.traceCollector?.addEntry("system", {
        type: "info",
        content: `Recipe run completed: ${recipe.name} (${run.status})`,
        metadata: {
          runId,
          recipeId,
          duration: result.duration,
          stepsCompleted: completedSteps,
          stepsFailed: failedSteps,
        },
      });

      this.emit("recipe:run-completed", { runId, recipeId, result });

      return result;
    } catch (err: any) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();

      const result: RecipeResult = {
        recipeId,
        success: false,
        output: "",
        duration: Date.now() - startTime,
        stepsCompleted: run.steps.filter((s) => s.status === "completed").length,
        stepsFailed: run.steps.filter((s) => s.status === "failed").length + 1,
      };

      run.result = result;

      await this.traceCollector?.addEntry("system", {
        type: "error",
        content: `Recipe run failed: ${recipe.name} - ${err.message}`,
        metadata: { runId, recipeId, error: err.message },
      });

      this.emit("recipe:run-failed", { runId, recipeId, error: err.message });

      return result;
    } finally {
      // Save the run record
      this.saveRunRecord(run);
      this.activeRuns.delete(runId);
    }
  }

  /**
   * Cancel an active recipe run
   */
  async cancelRun(runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    run.status = "cancelled";
    run.completedAt = new Date().toISOString();

    // Mark running steps as cancelled
    for (const step of run.steps) {
      if (step.status === "running") {
        step.status = "failed";
        step.error = "Cancelled by user";
        step.completedAt = new Date().toISOString();
      }
    }

    this.emit("recipe:run-cancelled", { runId, recipeId: run.recipeId });
  }

  // ─── Sub-Recipe Execution ────────────────────────────────────────────────

  /**
   * Run sub-recipes sequentially
   */
  private async runSubRecipesSequential(
    run: RecipeRun,
    recipe: Recipe,
    parentVars: Record<string, string>,
    parentOutput: string
  ): Promise<void> {
    for (const subRef of recipe.subRecipes) {
      // Check condition
      if (subRef.condition && !this.evaluateCondition(subRef.condition, parentVars, parentOutput)) {
        const step: RecipeStep = {
          id: crypto.randomUUID(),
          type: "sub_recipe",
          name: subRef.name,
          status: "skipped",
        };
        run.steps.push(step);
        continue;
      }

      const step: RecipeStep = {
        id: crypto.randomUUID(),
        type: "sub_recipe",
        name: subRef.name,
        status: "running",
        startedAt: new Date().toISOString(),
      };
      run.steps.push(step);

      try {
        // Merge parent variables with overrides
        const subVars = {
          ...parentVars,
          ...this.substituteVariablesInMap(subRef.variableOverrides || {}, parentVars),
        };

        const subResult = await this.run(subRef.recipeId, subVars);

        step.status = subResult.success ? "completed" : "failed";
        step.completedAt = new Date().toISOString();
        step.output = subResult.output.substring(0, 5000);
        step.subRecipeRunId = subResult.recipeId;

        if (!subResult.success && subRef.onFailure === "stop") {
          throw new Error(`Sub-recipe ${subRef.name} failed`);
        }
      } catch (err: any) {
        step.status = "failed";
        step.completedAt = new Date().toISOString();
        step.error = err.message;

        if (subRef.onFailure === "stop") {
          throw err;
        } else if (subRef.onFailure === "retry") {
          // Retry once
          try {
            const retryVars = {
              ...parentVars,
              ...this.substituteVariablesInMap(subRef.variableOverrides || {}, parentVars),
            };
            const retryResult = await this.run(subRef.recipeId, retryVars);
            step.status = retryResult.success ? "completed" : "failed";
            step.output = retryResult.output.substring(0, 5000);
          } catch (retryErr: any) {
            step.error = `Retry failed: ${retryErr.message}`;
            if (!recipe.settings.continueOnError) {
              throw retryErr;
            }
          }
        }
      }
    }
  }

  /**
   * Run sub-recipes in parallel
   */
  private async runSubRecipesParallel(
    run: RecipeRun,
    recipe: Recipe,
    parentVars: Record<string, string>,
    parentOutput: string
  ): Promise<void> {
    const maxParallel = recipe.settings.maxParallelExecutions || 3;
    const eligibleSubs = recipe.subRecipes.filter((subRef) => {
      if (subRef.condition) {
        return this.evaluateCondition(subRef.condition, parentVars, parentOutput);
      }
      return true;
    });

    // Split into batches
    const batches: SubRecipeRef[][] = [];
    for (let i = 0; i < eligibleSubs.length; i += maxParallel) {
      batches.push(eligibleSubs.slice(i, i + maxParallel));
    }

    for (const batch of batches) {
      const promises = batch.map(async (subRef) => {
        const step: RecipeStep = {
          id: crypto.randomUUID(),
          type: "sub_recipe",
          name: subRef.name,
          status: "running",
          startedAt: new Date().toISOString(),
        };
        run.steps.push(step);

        try {
          const subVars = {
            ...parentVars,
            ...this.substituteVariablesInMap(subRef.variableOverrides || {}, parentVars),
          };

          const subResult = await this.run(subRef.recipeId, subVars);

          step.status = subResult.success ? "completed" : "failed";
          step.completedAt = new Date().toISOString();
          step.output = subResult.output.substring(0, 5000);

          return subResult;
        } catch (err: any) {
          step.status = "failed";
          step.completedAt = new Date().toISOString();
          step.error = err.message;
          throw err;
        }
      });

      // Wait for all in batch to complete (or fail)
      const results = await Promise.allSettled(promises);

      // Check if any failed and we should stop
      const hasFailure = results.some((r) => r.status === "rejected");
      if (hasFailure && !recipe.settings.continueOnError) {
        throw new Error("One or more sub-recipes failed");
      }
    }
  }

  // ─── Variable Handling ───────────────────────────────────────────────────

  /**
   * Resolve variables: merge provided values with defaults
   */
  private resolveVariables(
    recipe: Recipe,
    provided?: Record<string, string>
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const variable of recipe.variables) {
      if (provided && provided[variable.name] !== undefined) {
        resolved[variable.name] = provided[variable.name];
      } else if (variable.defaultValue !== undefined) {
        resolved[variable.name] = variable.defaultValue;
      } else if (variable.required) {
        throw new Error(`Required variable "${variable.name}" is not provided`);
      }
    }

    return resolved;
  }

  /**
   * Validate that all required variables are provided
   */
  private validateVariables(
    recipe: Recipe,
    resolved: Record<string, string>
  ): void {
    for (const variable of recipe.variables) {
      if (variable.required && !resolved[variable.name]) {
        throw new Error(
          `Required variable "${variable.name}" is missing. ${variable.description}`
        );
      }

      // Validate select type
      if (variable.type === "select" && variable.options && resolved[variable.name]) {
        if (!variable.options.includes(resolved[variable.name])) {
          throw new Error(
            `Variable "${variable.name}" must be one of: ${variable.options.join(", ")}`
          );
        }
      }
    }
  }

  /**
   * Substitute variables in a template string
   * Supports: {{variable}}, {{#variable}}...{{/variable}} (conditional blocks)
   */
  private substituteVariables(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template;

    // Handle conditional blocks: {{#variable}}...{{/variable}}
    const conditionalRegex = /\{\{#(\w+)\}\}(.*?)\{\{\/\1\}\}/gs;
    result = result.replace(conditionalRegex, (_match, varName, content) => {
      const value = variables[varName];
      if (value && value.trim().length > 0) {
        // Replace the variable within the content
        return content.replace(
          new RegExp(`\\{\\{${varName}\\}\\}`, "g"),
          value
        );
      }
      return "";
    });

    // Handle simple variable substitution: {{variable}}
    const variableRegex = /\{\{(\w+)\}\}/g;
    result = result.replace(variableRegex, (_match, varName) => {
      return variables[varName] !== undefined ? variables[varName] : `{{${varName}}}`;
    });

    return result;
  }

  /**
   * Substitute variables in a map of values
   */
  private substituteVariablesInMap(
    map: Record<string, string>,
    variables: Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(map)) {
      result[key] = this.substituteVariables(value, variables);
    }
    return result;
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(
    condition: string,
    variables: Record<string, string>,
    context?: string
  ): boolean {
    try {
      // Create a safe evaluation context
      const sandbox: Record<string, unknown> = {
        ...variables,
        context,
        result: context,
        // Safe utility functions
        includes: (str: string, search: string) => str.includes(search),
        startsWith: (str: string, search: string) => str.startsWith(search),
        endsWith: (str: string, search: string) => str.endsWith(search),
        length: (str: string) => str.length,
        isEmpty: (str: string) => !str || str.trim().length === 0,
        isNotEmpty: (str: string) => str && str.trim().length > 0,
      };

      // Use Function constructor for simple evaluation
      const fn = new Function(
        ...Object.keys(sandbox),
        `"use strict"; return (${condition});`
      );

      return fn(...Object.values(sandbox)) as boolean;
    } catch {
      console.warn(`[RecipeEngine] Condition evaluation failed: ${condition}`);
      return false;
    }
  }

  // ─── Prompt Execution ────────────────────────────────────────────────────

  /**
   * Execute a prompt using the configured provider
   */
  private async executePrompt(
    prompt: string,
    settings?: RecipeSettings
  ): Promise<string> {
    if (!this.providerManager) {
      throw new Error("No provider manager available for executing prompts");
    }

    const model = settings?.model || "gpt-4o";
    const maxRetries = settings?.maxRetries || 1;
    const retryDelayMs = settings?.retryDelayMs || 1000;
    const timeoutMs = settings?.timeoutMs || 120000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.providerManager.sendDirect(
          model,
          prompt,
          {
            temperature: settings?.temperature,
            maxTokens: settings?.maxTokens,
            timeout: timeoutMs,
          }
        );

        return response.content || "";
      } catch (err: any) {
        lastError = err;

        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Prompt execution failed");
  }

  // ─── Slash Commands ──────────────────────────────────────────────────────

  /**
   * Look up a recipe by slash command
   */
  async getRecipeBySlashCommand(command: string): Promise<Recipe | undefined> {
    const recipeId = this.slashCommandMap.get(command);
    if (!recipeId) return undefined;
    return this.recipes.get(recipeId);
  }

  /**
   * Get all registered slash commands
   */
  getSlashCommands(): Map<string, string> {
    return new Map(this.slashCommandMap);
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────

  /**
   * Set up scheduled recipes
   */
  private setupScheduledRecipes(): void {
    for (const recipe of this.recipes.values()) {
      if (recipe.schedule?.enabled) {
        this.setupRecipeSchedule(recipe);
      }
    }
  }

  /**
   * Set up a cron schedule for a recipe using a lightweight scheduler.
   * Supports common cron patterns: * * * * * (min hour day month weekday)
   */
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
        console.info(`[RecipeEngine] Running scheduled recipe: ${recipe.name}`);
        try {
          const result = await this.run(
            recipe.id,
            recipe.schedule?.variables
          );

          // Update schedule metadata
          if (recipe.schedule) {
            recipe.schedule.lastRunAt = new Date().toISOString();
          }

          await this.traceCollector?.addEntry("system", {
            type: "info",
            content: `Scheduled recipe completed: ${recipe.name}`,
            metadata: { recipeId: recipe.id, result: result.success },
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
        `[RecipeEngine] Failed to setup schedule for ${recipe.name}:`,
        err
      );
    }
  }

  // ─── Run History ─────────────────────────────────────────────────────────

  /**
   * Get run history for a recipe
   */
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

  private validateRecipe(recipe: Recipe): void {
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
          `[RecipeEngine] Error loading recipe file ${file}:`,
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

  private saveRunRecord(run: RecipeRun): void {
    const filePath = path.join(this.runsDir, `${run.id}.json`);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
    } catch (err) {
      console.error("[RecipeEngine] Error saving run record:", err);
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
        "RecipeEngine is not initialized. Call initialize() first."
      );
    }
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  getRecipeCount(): number {
    return this.recipes.size;
  }

  getActiveRuns(): RecipeRun[] {
    return Array.from(this.activeRuns.values());
  }

  // ─── Lightweight Cron Scheduler ────────────────────────────────────────────

  /**
   * Parse a cron expression and schedule a recurring callback.
   * Supports standard 5-field cron: min hour day month weekday
   * Also supports shorthand: @yearly, @monthly, @weekly, @daily, @hourly, @every_Ns/m/h
   */
  private parseCronAndSchedule(
    expression: string,
    callback: () => void
  ): { timer: NodeJS.Timeout; stop: () => void } {
    const ms = this.cronToMilliseconds(expression);
    if (ms <= 0) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }
    // Fire the callback immediately, then schedule at interval
    let stopped = false;
    const timer = setInterval(() => {
      if (!stopped) callback();
    }, ms);
    // Fire once immediately
    callback();
    return {
      timer,
      stop: () => {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  /**
   * Convert a cron expression to a millisecond interval.
   * For simplicity, we support:
   *  - Shorthand aliases: @yearly, @monthly, @weekly, @daily, @hourly
   *  - @every_N notation: @every_30m, @every_1h, @every_30s
   *  - Fixed-interval patterns like star/N star star star star (every N minutes)
   * For full cron semantics, the npm `cron` package can be installed optionally.
   */
  private cronToMilliseconds(expression: string): number {
    const expr = expression.trim();

    // Shorthand aliases
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

    // @every_Ns, @every_Nm, @every_Nh
    const everyMatch = expr.match(/^@every[_\s](\d+)([smh])$/i);
    if (everyMatch) {
      const value = parseInt(everyMatch[1], 10);
      const unit = everyMatch[2].toLowerCase();
      if (unit === "s") return value * 1000;
      if (unit === "m") return value * 60 * 1000;
      if (unit === "h") return value * 60 * 60 * 1000;
    }

    // 5-field cron: try to extract a fixed interval from "*/N * * * *"
    const parts = expr.split(/\s+/);
    if (parts.length === 5) {
      const minuteField = parts[0];
      const hourField = parts[1];

      // Every N minutes: */N * * * *
      const minuteStep = minuteField.match(/^\*\/(\d+)$/);
      if (minuteStep && hourField === "*") {
        const n = parseInt(minuteStep[1], 10);
        if (n > 0 && n <= 59) {
          return n * 60 * 1000;
        }
      }

      // Every N hours: 0 */N * * *
      const hourStep = hourField.match(/^\*\/(\d+)$/);
      if (hourStep && minuteField === "0") {
        const n = parseInt(hourStep[1], 10);
        if (n > 0 && n <= 23) {
          return n * 60 * 60 * 1000;
        }
      }

      // Every minute: * * * * *
      if (minuteField === "*" && hourField === "*") {
        return 60 * 1000;
      }

      // Every hour: 0 * * * *
      if (minuteField === "0" && hourField === "*") {
        return 60 * 60 * 1000;
      }

      // Specific minute every hour: N * * * *
      const specificMinute = minuteField.match(/^(\d+)$/);
      if (specificMinute && hourField === "*") {
        return 60 * 60 * 1000; // hourly
      }
    }

    // Default: if we can't parse, treat as every hour (safe fallback)
    console.warn(
      `[RecipeEngine] Complex cron expression "${expression}" not fully supported by built-in scheduler. ` +
      `Defaulting to hourly. For full cron support, install the 'cron' npm package.`
    );
    return 60 * 60 * 1000;
  }

  /**
   * Get the next Date for a cron expression (approximate)
   */
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

    // Cancel active runs
    for (const [runId] of this.activeRuns) {
      await this.cancelRun(runId);
    }

    this.recipes.clear();
    this.slashCommandMap.clear();
    this.initialized = false;

    console.info("[RecipeEngine] Shut down");
  }
}
