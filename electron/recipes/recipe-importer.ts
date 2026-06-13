/**
 * OpenAgent-Desktop - Recipe Importer/Exporter
 *
 * Import and export recipes in YAML or JSON format.
 * Like Goose's recipe YAML/JSON system.
 * Supports validation, transformation, and format conversion.
 *
 * Features:
 * - Import from string, file, or URL (YAML/JSON)
 * - Export to string or file (YAML/JSON)
 * - Schema validation with required fields, type checking, variable validation
 * - Backward compatibility: auto-migrate old format recipes
 * - Format conversion between JSON and YAML
 * - URL import: fetch recipe from GitHub raw, gist, etc.
 * - Recipe collections: multiple recipes in one file
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as yaml from "js-yaml";
import { Recipe, RecipeVariable, RecipeSettings, SubRecipeRef, RecipeSchedule } from "./engine";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type RecipeFormat = "json" | "yaml" | "url";

export interface ImportResult {
  success: boolean;
  recipe?: Recipe;
  recipes?: Recipe[]; // For collections
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Legacy format types for backward compatibility ───────────────────────────

interface _LegacyRecipeV0 {
  title?: string;
  body?: string;
  args?: Record<string, { description?: string; default?: string; required?: boolean }>;
  extensions?: string[];
  response?: { model?: string; temperature?: number };
}

interface _LegacyRecipeV1 {
  name?: string;
  description?: string;
  prompt?: string;
  variables?: Array<{
    name: string;
    desc?: string;
    description?: string;
    default?: string;
    required?: boolean;
    type?: string;
    choices?: string[];
  }>;
  extensions?: string[];
  settings?: {
    max_retries?: number;
    timeout?: number;
    model?: string;
    temperature?: number;
  };
  subrecipes?: Array<{
    recipe: string;
    name?: string;
    variables?: Record<string, string>;
  }>;
  command?: string;
  schedule?: string;
  tags?: string[];
  version?: string;
  author?: string;
}

// ─── Recipe Importer ──────────────────────────────────────────────────────────

export class RecipeImporter {
  private static readonly CURRENT_VERSION = "2.0.0";

  /**
   * Import a recipe from a string (JSON or YAML)
   */
  importFromString(content: string, format: RecipeFormat): ImportResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!content || !content.trim()) {
      return { success: false, errors: ["Empty content provided"], warnings: [] };
    }

    try {
      let parsed: any;

      if (format === "yaml") {
        parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
      } else {
        parsed = JSON.parse(content);
      }

      // Check if it's a collection (array of recipes)
      if (Array.isArray(parsed)) {
        const recipes: Recipe[] = [];
        for (let i = 0; i < parsed.length; i++) {
          const itemResult = this.processRecipeObject(parsed[i], i);
          if (itemResult.recipe) {
            recipes.push(itemResult.recipe);
          }
          errors.push(...itemResult.errors.map((e) => `[recipe ${i}]: ${e}`));
          warnings.push(...itemResult.warnings.map((w) => `[recipe ${i}]: ${w}`));
        }

        if (recipes.length === 0) {
          return { success: false, errors: errors.length > 0 ? errors : ["No valid recipes found in collection"], warnings };
        }

        return { success: true, recipes, errors, warnings, recipe: recipes[0] };
      }

      // Single recipe
      const result = this.processRecipeObject(parsed);
      return {
        success: result.recipe !== undefined,
        recipe: result.recipe,
        errors: [...errors, ...result.errors],
        warnings: [...warnings, ...result.warnings],
      };
    } catch (err: any) {
      return {
        success: false,
        errors: [`Failed to parse content: ${err.message}`],
        warnings: [],
      };
    }
  }

  /**
   * Import a recipe from a file path
   */
  async importFromFile(filePath: string): Promise<ImportResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, errors: [`File not found: ${filePath}`], warnings: [] };
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filePath).toLowerCase();

      let format: RecipeFormat;
      if (ext === ".yaml" || ext === ".yml") {
        format = "yaml";
      } else if (ext === ".json") {
        format = "json";
      } else {
        // Try to auto-detect format
        format = this.detectFormat(content);
      }

      return this.importFromString(content, format);
    } catch (err: any) {
      return {
        success: false,
        errors: [`Failed to read file: ${err.message}`],
        warnings: [],
      };
    }
  }

  /**
   * Import a recipe from a URL (GitHub raw, gist, etc.)
   */
  async importFromUrl(url: string): Promise<ImportResult> {
    try {
      const content = await this.fetchFromUrl(url);

      // Auto-detect format from URL or content
      let format: RecipeFormat = "json";
      if (url.endsWith(".yaml") || url.endsWith(".yml")) {
        format = "yaml";
      } else if (url.endsWith(".json")) {
        format = "json";
      } else {
        format = this.detectFormat(content);
      }

      const result = this.importFromString(content, format);

      // Mark source URL
      if (result.recipe) {
        result.recipe.source = url;
      }
      if (result.recipes) {
        for (const r of result.recipes) {
          r.source = url;
        }
      }

      return result;
    } catch (err: any) {
      return {
        success: false,
        errors: [`Failed to fetch from URL: ${err.message}`],
        warnings: [],
      };
    }
  }

  /**
   * Export a recipe to string in the specified format
   */
  exportToString(recipe: Recipe, format: RecipeFormat): string {
    // Strip internal / runtime fields
    const exportable = this.toExportable(recipe);

    if (format === "yaml") {
      return yaml.dump(exportable, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
        quotingType: '"',
        forceQuotes: false,
      });
    }

    return JSON.stringify(exportable, null, 2);
  }

  /**
   * Export a recipe to a file
   */
  async exportToFile(recipe: Recipe, filePath: string, format: RecipeFormat): Promise<void> {
    const content = this.exportToString(recipe, format);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");
  }

  /**
   * Validate a recipe object (raw / unprocessed)
   */
  validate(recipe: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!recipe || typeof recipe !== "object") {
      return { valid: false, errors: ["Recipe must be an object"], warnings: [] };
    }

    // ─── Required fields ───────────────────────────────────────────────────

    if (!recipe.name && !recipe.title) {
      errors.push("Missing required field: 'name'");
    } else if ((recipe.name || recipe.title).trim().length === 0) {
      errors.push("Field 'name' must not be empty");
    }

    if (!recipe.prompt && !recipe.body) {
      errors.push("Missing required field: 'prompt'");
    } else if ((recipe.prompt || recipe.body || "").trim().length === 0) {
      errors.push("Field 'prompt' must not be empty");
    }

    // ─── Type checking ─────────────────────────────────────────────────────

    if (recipe.name !== undefined && typeof recipe.name !== "string") {
      errors.push("Field 'name' must be a string");
    }
    if (recipe.description !== undefined && typeof recipe.description !== "string") {
      errors.push("Field 'description' must be a string");
    }
    if (recipe.version !== undefined && typeof recipe.version !== "string") {
      errors.push("Field 'version' must be a string");
    }
    if (recipe.author !== undefined && typeof recipe.author !== "string") {
      errors.push("Field 'author' must be a string");
    }
    if (recipe.prompt !== undefined && typeof recipe.prompt !== "string") {
      errors.push("Field 'prompt' must be a string");
    }
    if (recipe.extensions !== undefined && !Array.isArray(recipe.extensions)) {
      errors.push("Field 'extensions' must be an array");
    }
    if (recipe.tags !== undefined && !Array.isArray(recipe.tags)) {
      errors.push("Field 'tags' must be an array");
    }
    if (recipe.slashCommand !== undefined && typeof recipe.slashCommand !== "string") {
      errors.push("Field 'slashCommand' must be a string");
    }

    // ─── Variable validation ───────────────────────────────────────────────

    if (recipe.variables !== undefined) {
      if (!Array.isArray(recipe.variables)) {
        errors.push("Field 'variables' must be an array");
      } else {
        const varNames = new Set<string>();
        for (let i = 0; i < recipe.variables.length; i++) {
          const v = recipe.variables[i];
          if (!v.name) {
            errors.push(`Variable at index ${i} is missing 'name'`);
          } else {
            if (varNames.has(v.name)) {
              errors.push(`Duplicate variable name: '${v.name}'`);
            }
            varNames.add(v.name);
          }

          if (v.type && !["string", "number", "boolean", "file", "select"].includes(v.type)) {
            errors.push(`Variable '${v.name}' has invalid type: '${v.type}'`);
          }

          if (v.type === "select" && (!v.options || !Array.isArray(v.options) || v.options.length === 0)) {
            errors.push(`Variable '${v.name}' of type 'select' must have non-empty 'options' array`);
          }

          // Check that variable is referenced in the prompt
          if (recipe.prompt && v.name && !recipe.prompt.includes(`{{${v.name}}}`) && !recipe.prompt.includes(`{{#${v.name}}}`)) {
            warnings.push(`Variable '${v.name}' is not referenced in the prompt template`);
          }
        }
      }
    }

    // ─── Sub-recipe validation ─────────────────────────────────────────────

    if (recipe.subRecipes !== undefined) {
      if (!Array.isArray(recipe.subRecipes)) {
        errors.push("Field 'subRecipes' must be an array");
      } else {
        for (let i = 0; i < recipe.subRecipes.length; i++) {
          const sr = recipe.subRecipes[i];
          if (!sr.recipeId && !sr.recipe) {
            errors.push(`Sub-recipe at index ${i} is missing 'recipeId'`);
          }
          if (!sr.name) {
            warnings.push(`Sub-recipe at index ${i} is missing 'name'`);
          }
        }
      }
    }

    // ─── Settings validation ───────────────────────────────────────────────

    if (recipe.settings !== undefined) {
      if (typeof recipe.settings !== "object") {
        errors.push("Field 'settings' must be an object");
      } else {
        if (recipe.settings.maxRetries !== undefined && (typeof recipe.settings.maxRetries !== "number" || recipe.settings.maxRetries < 0)) {
          errors.push("settings.maxRetries must be a non-negative number");
        }
        if (recipe.settings.timeoutMs !== undefined && (typeof recipe.settings.timeoutMs !== "number" || recipe.settings.timeoutMs < 0)) {
          errors.push("settings.timeoutMs must be a non-negative number");
        }
        if (recipe.settings.temperature !== undefined && (typeof recipe.settings.temperature !== "number" || recipe.settings.temperature < 0 || recipe.settings.temperature > 2)) {
          errors.push("settings.temperature must be between 0 and 2");
        }
        if (recipe.settings.maxTokens !== undefined && (typeof recipe.settings.maxTokens !== "number" || recipe.settings.maxTokens < 1)) {
          errors.push("settings.maxTokens must be a positive number");
        }
      }
    }

    // ─── Schedule validation ───────────────────────────────────────────────

    if (recipe.schedule !== undefined) {
      if (typeof recipe.schedule !== "object") {
        errors.push("Field 'schedule' must be an object");
      } else {
        if (recipe.schedule.cron !== undefined && typeof recipe.schedule.cron !== "string") {
          errors.push("schedule.cron must be a string");
        }
        if (recipe.schedule.timezone !== undefined && typeof recipe.schedule.timezone !== "string") {
          errors.push("schedule.timezone must be a string");
        }
      }
    }

    // ─── Warnings for best practices ──────────────────────────────────────

    if (!recipe.description) {
      warnings.push("Missing 'description' — adding one improves discoverability");
    }
    if (!recipe.version) {
      warnings.push("Missing 'version' — defaulting to '1.0.0'");
    }
    if (!recipe.author) {
      warnings.push("Missing 'author' — defaulting to 'Unknown'");
    }
    if (recipe.extensions && recipe.extensions.length === 0 && recipe.prompt && recipe.prompt.length > 200) {
      warnings.push("No extensions specified for a complex recipe — consider adding relevant extensions");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Convert between formats
   */
  convertFormat(content: string, fromFormat: RecipeFormat, toFormat: RecipeFormat): string {
    if (fromFormat === toFormat) return content;

    // Parse the source format
    let parsed: any;
    if (fromFormat === "yaml") {
      parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    } else {
      parsed = JSON.parse(content);
    }

    // Serialize to target format
    if (toFormat === "yaml") {
      return yaml.dump(parsed, { indent: 2, lineWidth: 120, noRefs: true });
    }

    return JSON.stringify(parsed, null, 2);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Process a raw recipe object: validate, migrate, normalize
   */
  private processRecipeObject(raw: any, _index?: number): { recipe?: Recipe; errors: string[]; warnings: string[] } {
    const validation = this.validate(raw);
    if (!validation.valid) {
      return { errors: validation.errors, warnings: validation.warnings };
    }

    // Attempt migration from legacy formats
    const migrated = this.migrateRecipe(raw);

    // Normalize to current Recipe format
    const recipe = this.normalizeRecipe(migrated);

    return { recipe, errors: [], warnings: validation.warnings };
  }

  /**
   * Migrate a recipe from legacy formats to current format
   */
  private migrateRecipe(raw: any): any {
    // V0 format: title/body/args/response
    if (raw.title && raw.body && !raw.name && !raw.prompt) {
      const migrated: any = {
        name: raw.title,
        description: raw.description || `Imported from v0 format: ${raw.title}`,
        prompt: raw.body,
        version: raw.version || "1.0.0",
        author: raw.author || "Unknown",
        extensions: raw.extensions || [],
        variables: [],
        settings: {},
        tags: raw.tags || [],
      };

      // Convert args format
      if (raw.args && typeof raw.args === "object") {
        for (const [argName, argDef] of Object.entries(raw.args)) {
          const a = argDef as any;
          migrated.variables.push({
            name: argName,
            description: a.description || "",
            defaultValue: a.default,
            required: a.required || false,
            type: "string",
          });
        }
      }

      // Convert response settings
      if (raw.response) {
        if (raw.response.model) migrated.settings.model = raw.response.model;
        if (raw.response.temperature !== undefined) migrated.settings.temperature = raw.response.temperature;
      }

      if (raw.command) migrated.slashCommand = raw.command;
      return migrated;
    }

    // V1 format: name/prompt with snake_case settings
    if (raw.name && raw.prompt && (raw.settings?.max_retries !== undefined || raw.settings?.timeout !== undefined)) {
      const migrated: any = { ...raw };

      // Convert snake_case settings
      if (raw.settings) {
        const settings: any = {};
        if (raw.settings.max_retries !== undefined) settings.maxRetries = raw.settings.max_retries;
        if (raw.settings.timeout !== undefined) settings.timeoutMs = raw.settings.timeout;
        if (raw.settings.model !== undefined) settings.model = raw.settings.model;
        if (raw.settings.temperature !== undefined) settings.temperature = raw.settings.temperature;
        migrated.settings = settings;
      }

      // Convert subrecipes format
      if (raw.subrecipes && Array.isArray(raw.subrecipes)) {
        migrated.subRecipes = raw.subrecipes.map((sr: any, idx: number) => ({
          id: `sub:${idx}`,
          recipeId: sr.recipe,
          name: sr.name || sr.recipe,
          variableOverrides: sr.variables || {},
        }));
        delete migrated.subrecipes;
      }

      // Convert variables with 'desc' field
      if (raw.variables) {
        migrated.variables = raw.variables.map((v: any) => ({
          name: v.name,
          description: v.description || v.desc || "",
          defaultValue: v.default || v.defaultValue,
          required: v.required || false,
          type: v.type || "string",
          options: v.choices || v.options,
        }));
      }

      if (raw.command) {
        migrated.slashCommand = raw.command;
        delete migrated.command;
      }

      return migrated;
    }

    // Already current format — return as-is
    return raw;
  }

  /**
   * Normalize a migrated raw object into a proper Recipe
   */
  private normalizeRecipe(raw: any): Recipe {
    const now = new Date().toISOString();
    const recipeId = raw.id || `imported:${crypto.randomUUID()}`;

    return {
      id: recipeId,
      name: raw.name || raw.title || "Unnamed Recipe",
      description: raw.description || "",
      version: raw.version || "1.0.0",
      author: raw.author || "Unknown",
      extensions: Array.isArray(raw.extensions) ? raw.extensions : [],
      prompt: raw.prompt || raw.body || "",
      subRecipes: Array.isArray(raw.subRecipes)
        ? raw.subRecipes.map((sr: any, idx: number) => this.normalizeSubRecipe(sr, idx))
        : [],
      variables: Array.isArray(raw.variables)
        ? raw.variables.map((v: any) => this.normalizeVariable(v))
        : [],
      settings: this.normalizeSettings(raw.settings),
      slashCommand: raw.slashCommand || raw.command,
      schedule: raw.schedule ? this.normalizeSchedule(raw.schedule) : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      createdAt: raw.createdAt || now,
      updatedAt: now,
      isBuiltin: false,
      source: raw.source,
    };
  }

  private normalizeVariable(v: any): RecipeVariable {
    return {
      name: v.name || "",
      description: v.description || v.desc || "",
      defaultValue: v.defaultValue || v.default,
      required: v.required || false,
      type: v.type || "string",
      options: v.options || v.choices,
    };
  }

  private normalizeSubRecipe(sr: any, idx: number): SubRecipeRef {
    return {
      id: sr.id || `sub:${idx}`,
      recipeId: sr.recipeId || sr.recipe || "",
      name: sr.name || sr.recipeId || sr.recipe || `Sub-recipe ${idx + 1}`,
      variableOverrides: sr.variableOverrides || sr.variables || {},
      condition: sr.condition,
      onSuccess: sr.onSuccess,
      onFailure: sr.onFailure,
    };
  }

  private normalizeSettings(s: any): RecipeSettings {
    if (!s || typeof s !== "object") {
      return { maxRetries: 1, timeoutMs: 120000 };
    }
    return {
      maxRetries: s.maxRetries ?? s.max_retries ?? 1,
      retryDelayMs: s.retryDelayMs ?? s.retry_delay_ms,
      timeoutMs: s.timeoutMs ?? s.timeout ?? 120000,
      parallelSubRecipes: s.parallelSubRecipes ?? s.parallel_sub_recipes,
      maxParallelExecutions: s.maxParallelExecutions ?? s.max_parallel_executions,
      continueOnError: s.continueOnError ?? s.continue_on_error,
      model: s.model,
      temperature: s.temperature,
      maxTokens: s.maxTokens ?? s.max_tokens,
    };
  }

  private normalizeSchedule(s: any): RecipeSchedule {
    return {
      enabled: s.enabled !== false,
      cron: s.cron || "",
      variables: s.variables,
      timezone: s.timezone,
      lastRunAt: s.lastRunAt,
      nextRunAt: s.nextRunAt,
    };
  }

  /**
   * Create an exportable object (strip internal / runtime fields)
   */
  private toExportable(recipe: Recipe): any {
    return {
      name: recipe.name,
      description: recipe.description,
      version: recipe.version,
      author: recipe.author,
      prompt: recipe.prompt,
      variables: recipe.variables,
      subRecipes: recipe.subRecipes,
      settings: recipe.settings,
      extensions: recipe.extensions,
      slashCommand: recipe.slashCommand,
      schedule: recipe.schedule,
      tags: recipe.tags,
    };
  }

  /**
   * Auto-detect the format of a string (JSON vs YAML)
   */
  private detectFormat(content: string): RecipeFormat {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return "json";
    }
    return "yaml";
  }

  /**
   * Fetch content from a URL using Node.js http/https modules
   */
  private async fetchFromUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestModule = url.startsWith("https://") ? require("https") : require("http");

      const request = requestModule.get(url, { timeout: 15000 }, (res: any) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchFromUrl(res.headers.location).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => resolve(data));
        res.on("error", reject);
      });

      request.on("error", reject);
      request.on("timeout", () => {
        request.destroy();
        reject(new Error("Request timed out"));
      });
    });
  }
}
