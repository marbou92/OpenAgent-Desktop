/**
 * OpenAgent Desktop - Recipes View Component
 *
 * Recipe cookbook, custom recipes, import, create, run,
 * slash command preview, schedule, and share.
 */

import React, { useState } from 'react';
import { RecipeInfo, RecipeVariable, Toast } from '../../types';

const api = (window as any).openagent;

interface RecipesViewProps {
  recipes: RecipeInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const RecipesView: React.FC<RecipesViewProps> = ({ recipes, onRefresh, addToast }) => {
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [showImportForm, setShowImportForm] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const builtinRecipes = recipes.filter((r) => r.isBuiltin);
  const customRecipes = recipes.filter((r) => !r.isBuiltin);

  const filteredRecipes = searchQuery.trim()
    ? recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.slashCommand && r.slashCommand.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : recipes;

  const handleRunRecipe = async (recipe: RecipeInfo) => {
    if (!api?.recipes?.run) return;

    // Check required variables
    const missingRequired = recipe.variables
      .filter((v) => v.required && !variableValues[v.name] && !v.defaultValue)
      .map((v) => v.name);

    if (missingRequired.length > 0) {
      addToast({
        type: 'warning',
        title: 'Missing required variables',
        message: missingRequired.join(', '),
      });
      return;
    }

    setRunning(recipe.id);
    try {
      const result = await api.recipes.run(recipe.id, variableValues);
      if (result.success) {
        addToast({
          type: 'success',
          title: `Recipe "${recipe.name}" completed`,
          message: `Duration: ${(result.duration / 1000).toFixed(1)}s`,
        });
      } else {
        addToast({
          type: 'error',
          title: `Recipe "${recipe.name}" failed`,
          message: result.output.substring(0, 100),
        });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Recipe execution failed', message: err.message });
    } finally {
      setRunning(null);
    }
  };

  const handleImportRecipe = async () => {
    if (!api?.recipes?.import || !importUrl.trim()) return;
    try {
      await api.recipes.import(importUrl.trim());
      await onRefresh();
      setImportUrl('');
      setShowImportForm(false);
      addToast({ type: 'success', title: 'Recipe imported' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Import failed', message: err.message });
    }
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!api?.recipes?.delete) return;
    if (!confirm('Delete this recipe?')) return;
    try {
      await api.recipes.delete(recipeId);
      await onRefresh();
      setSelectedRecipe(null);
      addToast({ type: 'success', title: 'Recipe deleted' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete failed', message: err.message });
    }
  };

  const handleShareRecipe = (recipe: RecipeInfo) => {
    const shareData = btoa(JSON.stringify({
      name: recipe.name,
      description: recipe.description,
      prompt: recipe.description,
      variables: recipe.variables,
    }));
    const shareUrl = `openagent://import-recipe#data=${shareData}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      addToast({ type: 'success', title: 'Share URL copied to clipboard' });
    });
  };

  return (
    <div className="h-full flex" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Main List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Recipes</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {builtinRecipes.length} built-in / {customRecipes.length} custom
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImportForm(!showImportForm)}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
              >
                Import
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Create
              </button>
            </div>
          </div>

          {/* Import Form */}
          {showImportForm && (
            <div className="mb-3 p-3 rounded-lg border animate-fade-in" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Recipe URL or paste JSON"
                  className="flex-1 px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleImportRecipe()}
                />
                <button
                  onClick={handleImportRecipe}
                  disabled={!importUrl.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Import
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipes..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--color-text-primary)' }}
            />
          </div>
        </div>

        {/* Recipe List */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Built-in Recipes */}
          {builtinRecipes.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-tertiary)' }}>COOKBOOK</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredRecipes.filter((r) => r.isBuiltin).map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    isSelected={selectedRecipe?.id === recipe.id}
                    isRunning={running === recipe.id}
                    onSelect={setSelectedRecipe}
                    onRun={handleRunRecipe}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom Recipes */}
          {customRecipes.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-tertiary)' }}>CUSTOM RECIPES</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredRecipes.filter((r) => !r.isBuiltin).map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    isSelected={selectedRecipe?.id === recipe.id}
                    isRunning={running === recipe.id}
                    onSelect={setSelectedRecipe}
                    onRun={handleRunRecipe}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredRecipes.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No recipes found</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedRecipe && (
        <RecipeDetailPanel
          recipe={selectedRecipe}
          variableValues={variableValues}
          onVariableChange={(name, value) =>
            setVariableValues((prev) => ({ ...prev, [name]: value }))
          }
          onRun={handleRunRecipe}
          onDelete={handleDeleteRecipe}
          onShare={handleShareRecipe}
          onClose={() => {
            setSelectedRecipe(null);
            setVariableValues({});
          }}
          isRunning={running === selectedRecipe.id}
        />
      )}
    </div>
  );
};

// ─── Recipe Card ───────────────────────────────────────────────────────────────

const RecipeCard: React.FC<{
  recipe: RecipeInfo;
  isSelected: boolean;
  isRunning: boolean;
  onSelect: (recipe: RecipeInfo) => void;
  onRun: (recipe: RecipeInfo) => void;
}> = ({ recipe, isSelected, isRunning, onSelect, onRun }) => (
  <div
    onClick={() => onSelect(recipe)}
    className="rounded-xl p-4 border cursor-pointer transition-colors"
    style={{
      background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
      borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border-primary)',
    }}
    onMouseEnter={(e) => {
      if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-accent)';
    }}
    onMouseLeave={(e) => {
      if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-primary)';
    }}
  >
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: recipe.isBuiltin ? 'var(--color-accent-soft)' : 'rgba(34,197,94,0.1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={recipe.isBuiltin ? 'var(--color-accent)' : 'var(--color-success)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        <div>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{recipe.name}</span>
          {recipe.slashCommand && (
            <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--color-accent)' }}>
              {recipe.slashCommand}
            </div>
          )}
        </div>
      </div>
    </div>
    <p className="text-xs line-clamp-2 mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
      {recipe.description}
    </p>
    <div className="flex items-center justify-between">
      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recipe.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRun(recipe);
        }}
        disabled={isRunning}
        className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50 ml-auto"
        style={{ background: 'var(--color-accent)', color: 'white' }}
      >
        {isRunning ? 'Running...' : 'Run'}
      </button>
    </div>
  </div>
);

// ─── Recipe Detail Panel ───────────────────────────────────────────────────────

const RecipeDetailPanel: React.FC<{
  recipe: RecipeInfo;
  variableValues: Record<string, string>;
  onVariableChange: (name: string, value: string) => void;
  onRun: (recipe: RecipeInfo) => void;
  onDelete: (recipeId: string) => void;
  onShare: (recipe: RecipeInfo) => void;
  onClose: () => void;
  isRunning: boolean;
}> = ({ recipe, variableValues, onVariableChange, onRun, onDelete, onShare, onClose, isRunning }) => (
  <div
    className="w-80 border-l flex flex-col h-full"
    style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-secondary)' }}
  >
    <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Recipe Details</h3>
      <button onClick={onClose} className="p-1 rounded" style={{ color: 'var(--color-text-tertiary)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div>
        <h4 className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{recipe.name}</h4>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>v{recipe.version} by {recipe.author}</p>
      </div>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{recipe.description}</p>
      {recipe.slashCommand && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>SLASH COMMAND</div>
          <code className="text-sm px-2 py-1 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            {recipe.slashCommand}
          </code>
        </div>
      )}
      {recipe.variables.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>VARIABLES</div>
          <div className="space-y-2">
            {recipe.variables.map((variable) => (
              <div key={variable.name}>
                <label className="text-xs flex items-center gap-1 mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {variable.name}
                  {variable.required && <span style={{ color: 'var(--color-error)' }}>*</span>}
                </label>
                {variable.type === 'select' && variable.options ? (
                  <select
                    value={variableValues[variable.name] || variable.defaultValue || ''}
                    onChange={(e) => onVariableChange(variable.name, e.target.value)}
                    className="w-full px-2 py-1.5 rounded border text-xs"
                    style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                  >
                    <option value="">Select...</option>
                    {variable.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={variable.type === 'number' ? 'number' : 'text'}
                    value={variableValues[variable.name] || variable.defaultValue || ''}
                    onChange={(e) => onVariableChange(variable.name, e.target.value)}
                    placeholder={variable.description}
                    className="w-full px-2 py-1.5 rounded border text-xs"
                    style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {recipe.extensions.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>REQUIRED EXTENSIONS</div>
          <div className="flex flex-wrap gap-1">
            {recipe.extensions.map((ext) => (
              <span key={ext} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                {ext}
              </span>
            ))}
          </div>
        </div>
      )}
      {recipe.schedule && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>SCHEDULE</div>
          <code className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{recipe.schedule.cron}</code>
          {recipe.schedule.enabled ? (
            <span className="text-xs ml-2" style={{ color: 'var(--color-success)' }}>Active</span>
          ) : (
            <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>Inactive</span>
          )}
        </div>
      )}
    </div>
    <div className="p-4 border-t flex gap-2" style={{ borderColor: 'var(--color-border-secondary)' }}>
      <button
        onClick={() => onRun(recipe)}
        disabled={isRunning}
        className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        style={{ background: 'var(--color-accent)', color: 'white' }}
      >
        {isRunning ? 'Running...' : 'Run Recipe'}
      </button>
      <button
        onClick={() => onShare(recipe)}
        className="p-2 rounded-lg border"
        style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-tertiary)' }}
        title="Share"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>
      {!recipe.isBuiltin && (
        <button
          onClick={() => onDelete(recipe.id)}
          className="p-2 rounded-lg border"
          style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-error)' }}
          title="Delete"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

export default RecipesView;
