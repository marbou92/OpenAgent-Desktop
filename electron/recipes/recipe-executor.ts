/**
 * OpenAgent-Desktop - Recipe Executor
 *
 * Handles recipe execution logic: variable resolution, substitution,
 * prompt execution, sub-recipe orchestration (sequential and parallel),
 * and condition evaluation.
 */

import * as crypto from "crypto";
import {
  Recipe,
  RecipeSettings,
  RecipeRun,
  RecipeStep,
  RecipeResult,
  SubRecipeRef,
} from "./recipe-store";

export class RecipeExecutor {
  private providerManager?: any;
  private hookManager?: any;
  private traceCollector?: any;
  private store: any; // RecipeStore reference for run lookups

  constructor(deps: {
    providerManager?: any;
    hookManager?: any;
    traceCollector?: any;
    store: any;
  }) {
    this.providerManager = deps.providerManager;
    this.hookManager = deps.hookManager;
    this.traceCollector = deps.traceCollector;
    this.store = deps.store;
  }

  /**
   * Run a recipe with the given variables
   */
  async run(
    recipeId: string,
    variables?: Record<string, string>
  ): Promise<RecipeResult> {
    const recipes = this.store.getRecipesMap();
    const recipe = recipes.get(recipeId);
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

    this.store.setActiveRun(runId, run);

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Recipe run started: ${recipe.name}`,
      metadata: { runId, recipeId, variables: resolvedVars },
    });

    this.store.emit("recipe:run-started", { runId, recipeId });

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
      const completedSteps = run.steps.filter((s: RecipeStep) => s.status === "completed").length;
      const failedSteps = run.steps.filter((s: RecipeStep) => s.status === "failed").length;

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

      this.store.emit("recipe:run-completed", { runId, recipeId, result });

      return result;
    } catch (err: any) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();

      const result: RecipeResult = {
        recipeId,
        success: false,
        output: "",
        duration: Date.now() - startTime,
        stepsCompleted: run.steps.filter((s: RecipeStep) => s.status === "completed").length,
        stepsFailed: run.steps.filter((s: RecipeStep) => s.status === "failed").length + 1,
      };

      run.result = result;

      await this.traceCollector?.addEntry("system", {
        type: "error",
        content: `Recipe run failed: ${recipe.name} - ${err.message}`,
        metadata: { runId, recipeId, error: err.message },
      });

      this.store.emit("recipe:run-failed", { runId, recipeId, error: err.message });

      return result;
    } finally {
      // Save the run record
      this.store.saveRunRecord(run);
      this.store.deleteActiveRun(runId);
    }
  }

  /**
   * Cancel an active recipe run
   */
  async cancelRun(runId: string): Promise<void> {
    const run = this.store.getActiveRun(runId);
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

    this.store.emit("recipe:run-cancelled", { runId, recipeId: run.recipeId });
  }

  // ─── Sub-Recipe Execution ────────────────────────────────────────────────

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

  resolveVariables(
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

  validateVariables(
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
  substituteVariables(
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
  substituteVariablesInMap(
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
  evaluateCondition(
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
      console.warn(`[RecipeExecutor] Condition evaluation failed: ${condition}`);
      return false;
    }
  }

  // ─── Prompt Execution ────────────────────────────────────────────────────

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
}
