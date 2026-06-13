/**
 * OpenAgent-Desktop - Recipe Sharing
 *
 * Handles import/export of recipes, base64 URL sharing, deep link imports,
 * and fetching recipes from remote URLs.
 */

import * as crypto from "crypto";
import {
  Recipe,
} from "./recipe-store";

export class RecipeSharing {
  private store: any; // RecipeStore reference

  constructor(store: any) {
    this.store = store;
  }

  /**
   * Import a recipe from a URL or JSON string
   */
  async importFromSource(
    source: string,
    _format?: string
  ): Promise<Recipe> {
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
    const imported = await this.store.create({
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
    return this.store.create({
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
    const recipes = this.store.getRecipesMap();
    const recipe = recipes.get(recipeId);
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
}
