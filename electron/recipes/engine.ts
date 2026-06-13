/**
 * OpenAgent-Desktop - Recipe Engine (Facade)
 *
 * This file re-exports the RecipeEngine from the decomposed index.ts
 * to maintain backward compatibility with existing imports like:
 *   import { RecipeEngine } from './engine';
 *
 * The actual implementation is now split across:
 *   - recipe-store.ts    (CRUD, persistence, cookbook, scheduling)
 *   - recipe-executor.ts (variable substitution, step running, sub-recipes)
 *   - recipe-sharing.ts  (import/export, base64 URL sharing)
 *   - index.ts           (facade RecipeEngine composing the above)
 */

export {
  RecipeEngine,
  RecipeStore,
  RecipeExecutor,
  RecipeSharing,
} from './index';

export type {
  RecipeVariable,
  RecipeSettings,
  Recipe,
  SubRecipeRef,
  RecipeSchedule,
  RecipeRun,
  RecipeStep,
  RecipeResult,
  RecipeEngineOptions,
} from './index';
