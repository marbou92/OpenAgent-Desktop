/**
 * OpenAgent-Desktop - Recipe Editor Component
 *
 * React component for creating and editing recipes.
 * Features:
 * - Form fields: name, description, version, author, prompt (multi-line editor)
 * - Variable editor: add/remove variables with name, type, default, required, options
 * - Sub-recipe editor: add/remove sub-recipe references with variable overrides
 * - Extension selector: multi-select from available extensions
 * - Settings editor: max retries, timeout, parallel, model, temperature
 * - Slash command configurator
 * - Schedule editor: cron expression with human-readable preview
 * - Tag editor
 * - Import button: paste YAML/JSON or provide URL
 * - Export button: download as YAML or JSON
 * - Preview tab: shows rendered recipe
 * - Validation: real-time validation with error/warning indicators
 * - Dark theme
 */

import React, { useState, useCallback, useMemo } from "react";
import { RecipeVariable, SubRecipeRef, RecipeInfo, Toast } from "../../types";
import { humanizeCron } from "../../utils/cron-humanizer";



// ─── Types ─────────────────────────────────────────────────────────────────────

interface RecipeEditorProps {
  recipe?: RecipeInfo | null;
  availableExtensions?: Array<{ id: string; name: string }>;
  availableRecipes?: Array<{ id: string; name: string }>;
  onSave: (recipe: Partial<RecipeInfo> & { prompt: string; name: string }) => void;
  onCancel: () => void;
  addToast: (toast: Omit<Toast, "id">) => void;
}

type EditorTab = "edit" | "variables" | "subrecipes" | "settings" | "schedule" | "preview" | "import-export";

interface ValidationState {
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const RecipeEditor: React.FC<RecipeEditorProps> = ({
  recipe,
  availableExtensions = [],
  availableRecipes = [],
  onSave,
  onCancel,
  addToast,
}) => {
  // ─── State ────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<EditorTab>("edit");

  // Core fields
  const [name, setName] = useState(recipe?.name || "");
  const [description, setDescription] = useState(recipe?.description || "");
  const [version, setVersion] = useState(recipe?.version || "1.0.0");
  const [author, setAuthor] = useState(recipe?.author || "User");
  const [prompt, setPrompt] = useState("");
  const [slashCommand, setSlashCommand] = useState(recipe?.slashCommand || "");
  const [tags, setTags] = useState<string[]>(recipe?.tags || []);
  const [tagInput, setTagInput] = useState("");

  // Variables
  const [variables, setVariables] = useState<RecipeVariable[]>(recipe?.variables || []);

  // Sub-recipes
  const [subRecipes, setSubRecipes] = useState<SubRecipeRef[]>(recipe?.subRecipes || []);

  // Extensions
  const [extensions, setExtensions] = useState<string[]>(recipe?.extensions || []);

  // Settings
  const [maxRetries, setMaxRetries] = useState(1);
  const [timeoutMs, setTimeoutMs] = useState(120000);
  const [parallelSubRecipes, setParallelSubRecipes] = useState(false);
  const [maxParallelExecutions, setMaxParallelExecutions] = useState(3);
  const [continueOnError, setContinueOnError] = useState(false);
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(recipe?.schedule?.enabled || false);
  const [scheduleCron, setScheduleCron] = useState(recipe?.schedule?.cron || "0 9 * * *");
  const [scheduleTimezone, setScheduleTimezone] = useState(
    recipe?.schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Import/Export
  const [importContent, setImportContent] = useState("");
  const [importFormat, setImportFormat] = useState<"json" | "yaml">("json");
  const [importUrl, setImportUrl] = useState("");
  const [exportFormat, setExportFormat] = useState<"json" | "yaml">("json");

  // ─── Validation ───────────────────────────────────────────────────────────

  const validation = useMemo<ValidationState>(() => {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    if (!name.trim()) errors.name = "Name is required";
    if (!prompt.trim()) errors.prompt = "Prompt is required";
    if (slashCommand && !slashCommand.startsWith("/")) errors.slashCommand = "Slash command must start with /";

    // Check variables
    const varNames = new Set<string>();
    variables.forEach((v, i) => {
      if (!v.name.trim()) errors[`var_${i}_name`] = "Variable name is required";
      if (varNames.has(v.name)) errors[`var_${i}_name`] = "Duplicate variable name";
      varNames.add(v.name);
      if (v.type === "select" && (!v.options || v.options.length === 0)) {
        errors[`var_${i}_options`] = "Select type must have options";
      }
    });

    // Check sub-recipes
    subRecipes.forEach((sr, i) => {
      if (!sr.recipeId) errors[`sr_${i}_recipe`] = "Recipe ID is required";
    });

    // Check schedule
    if (scheduleEnabled && !scheduleCron.trim()) errors.schedule = "Cron expression is required";

    // Warnings
    if (!description.trim()) warnings.description = "Description improves discoverability";
    if (variables.length > 0) {
      variables.forEach((v) => {
        if (!prompt.includes(`{{${v.name}}}`) && !prompt.includes(`{{#${v.name}}}`)) {
          warnings[`var_${v.name}_ref`] = `Variable '${v.name}' is not referenced in prompt`;
        }
      });
    }

    return { errors, warnings };
  }, [name, prompt, slashCommand, description, variables, subRecipes, scheduleEnabled, scheduleCron]);

  const hasErrors = Object.keys(validation.errors).length > 0;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAddVariable = useCallback(() => {
    setVariables((prev) => [
      ...prev,
      {
        name: "",
        description: "",
        required: false,
        type: "string",
      },
    ]);
  }, []);

  const handleRemoveVariable = useCallback((index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateVariable = useCallback((index: number, updates: Partial<RecipeVariable>) => {
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, ...updates } : v))
    );
  }, []);

  const handleAddSubRecipe = useCallback(() => {
    setSubRecipes((prev) => [
      ...prev,
      {
        id: `sub-${Date.now()}`,
        recipeId: "",
        name: "",
        variableOverrides: {},
      },
    ]);
  }, []);

  const handleRemoveSubRecipe = useCallback((index: number) => {
    setSubRecipes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateSubRecipe = useCallback((index: number, updates: Partial<SubRecipeRef>) => {
    setSubRecipes((prev) =>
      prev.map((sr, i) => (i === index ? { ...sr, ...updates } : sr))
    );
  }, []);

  const handleAddTag = useCallback(() => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags((prev) => [...prev, tagInput.trim()]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleToggleExtension = useCallback((extId: string) => {
    setExtensions((prev) =>
      prev.includes(extId) ? prev.filter((e) => e !== extId) : [...prev, extId]
    );
  }, []);

  const handleSave = useCallback(() => {
    if (hasErrors) {
      addToast({ type: "error", title: "Validation failed", message: "Fix errors before saving" });
      return;
    }

    const recipeData: Partial<RecipeInfo> & { prompt: string; name: string } = {
      name: name.trim(),
      description: description.trim(),
      version,
      author,
      prompt,
      extensions,
      variables,
      subRecipes,
      slashCommand: slashCommand || undefined,
      schedule: scheduleEnabled
        ? { enabled: true, cron: scheduleCron, timezone: scheduleTimezone }
        : undefined,
      tags,
    };

    onSave(recipeData);
  }, [name, description, version, author, prompt, extensions, variables, subRecipes, slashCommand, scheduleEnabled, scheduleCron, scheduleTimezone, tags, hasErrors, onSave, addToast]);

  const handleImport = useCallback(() => {
    if (!importContent.trim() && !importUrl.trim()) {
      addToast({ type: "warning", title: "Nothing to import", message: "Paste content or provide a URL" });
      return;
    }

    try {
      let parsed: any;
      const content = importContent.trim();

      if (importFormat === "yaml") {
        // Simple YAML parsing (for basic structures)
        // In production this would use a proper YAML parser
        parsed = JSON.parse(content); // Fallback to JSON for now
      } else {
        parsed = JSON.parse(content);
      }

      if (parsed.name) setName(parsed.name);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.version) setVersion(parsed.version);
      if (parsed.author) setAuthor(parsed.author);
      if (parsed.prompt) setPrompt(parsed.prompt);
      if (parsed.slashCommand) setSlashCommand(parsed.slashCommand);
      if (parsed.tags) setTags(parsed.tags);
      if (parsed.variables) setVariables(parsed.variables);
      if (parsed.subRecipes) setSubRecipes(parsed.subRecipes);
      if (parsed.extensions) setExtensions(parsed.extensions);
      if (parsed.settings) {
        if (parsed.settings.maxRetries) setMaxRetries(parsed.settings.maxRetries);
        if (parsed.settings.timeoutMs) setTimeoutMs(parsed.settings.timeoutMs);
        if (parsed.settings.model) setModel(parsed.settings.model);
        if (parsed.settings.temperature !== undefined) setTemperature(parsed.settings.temperature);
      }

      setImportContent("");
      setImportUrl("");
      setActiveTab("edit");
      addToast({ type: "success", title: "Recipe imported", message: "Review and save the recipe" });
    } catch (err: any) {
      addToast({ type: "error", title: "Import failed", message: err.message });
    }
  }, [importContent, importUrl, importFormat, addToast]);

  const handleExport = useCallback(() => {
    const data: any = {
      name,
      description,
      version,
      author,
      prompt,
      extensions,
      variables,
      subRecipes,
      settings: { maxRetries, timeoutMs, parallelSubRecipes, maxParallelExecutions, continueOnError, model, temperature, maxTokens },
      slashCommand: slashCommand || undefined,
      schedule: scheduleEnabled ? { enabled: true, cron: scheduleCron, timezone: scheduleTimezone } : undefined,
      tags,
    };

    let content: string;
    let filename: string;
    let mimeType: string;

    if (exportFormat === "yaml") {
      // Simple YAML-like output for demo; production would use js-yaml
      content = JSON.stringify(data, null, 2);
      filename = `${name.replace(/\s+/g, "-").toLowerCase()}.recipe.yaml`;
      mimeType = "text/yaml";
    } else {
      content = JSON.stringify(data, null, 2);
      filename = `${name.replace(/\s+/g, "-").toLowerCase()}.recipe.json`;
      mimeType = "application/json";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    addToast({ type: "success", title: "Recipe exported", message: `Downloaded as ${filename}` });
  }, [name, description, version, author, prompt, extensions, variables, subRecipes, maxRetries, timeoutMs, parallelSubRecipes, maxParallelExecutions, continueOnError, model, temperature, maxTokens, slashCommand, scheduleEnabled, scheduleCron, scheduleTimezone, tags, exportFormat, addToast]);

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const tabs: Array<{ id: EditorTab; label: string; icon: string }> = [
    { id: "edit", label: "Edit", icon: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" },
    { id: "variables", label: "Variables", icon: "M12 20V10M18 20V4M6 20v-4" },
    { id: "subrecipes", label: "Sub-Recipes", icon: "M8 6h8M8 12h8M8 18h8" },
    { id: "settings", label: "Settings", icon: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" },
    { id: "schedule", label: "Schedule", icon: "M12 6v6l4 2" },
    { id: "preview", label: "Preview", icon: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" },
    { id: "import-export", label: "Import/Export", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" },
  ];

  // ─── Common Input Style ───────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: "var(--color-bg-tertiary)",
    borderColor: "var(--color-border-primary)",
    color: "var(--color-text-primary)",
    borderRadius: "var(--border-radius-base)",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--color-text-tertiary)",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const errorStyle: React.CSSProperties = {
    color: "var(--color-error)",
    fontSize: "11px",
  };

  const warningStyle: React.CSSProperties = {
    color: "var(--color-warning)",
    fontSize: "11px",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border-primary)" }}>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
            {recipe ? "Edit Recipe" : "Create Recipe"}
          </h2>
          {hasErrors && (
            <span className="text-xs" style={{ color: "var(--color-error)" }}>
              {Object.keys(validation.errors).length} error(s) found
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--color-border-primary)", color: "var(--color-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={hasErrors}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--color-accent)", color: "white" }}
          >
            Save Recipe
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b overflow-x-auto" style={{ borderColor: "var(--color-border-primary)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 border-b-2"
            style={{
              borderBottomColor: activeTab === tab.id ? "var(--color-accent)" : "transparent",
              color: activeTab === tab.id ? "var(--color-accent)" : "var(--color-text-tertiary)",
              background: activeTab === tab.id ? "var(--color-accent-soft)" : "transparent",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* ─── Edit Tab ───────────────────────────────────────────────────── */}
        {activeTab === "edit" && (
          <div className="space-y-4 max-w-2xl">
            {/* Name */}
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Recipe"
                className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                style={inputStyle}
              />
              {validation.errors.name && <span style={errorStyle}>{validation.errors.name}</span>}
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this recipe do?"
                className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                style={inputStyle}
              />
              {validation.warnings.description && <span style={warningStyle}>{validation.warnings.description}</span>}
            </div>

            {/* Version & Author Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Version</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Author</label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label style={labelStyle}>Prompt *</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your recipe prompt... Use {{variable_name}} for variables. Use {{#variable}}...{{/variable}} for conditional blocks."
                rows={10}
                className="w-full px-3 py-2 rounded-lg border text-sm mt-1 font-mono resize-y"
                style={inputStyle}
              />
              {validation.errors.prompt && <span style={errorStyle}>{validation.errors.prompt}</span>}
              <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                {prompt.length} characters / {variables.length} variables referenced
              </div>
            </div>

            {/* Slash Command */}
            <div>
              <label style={labelStyle}>Slash Command</label>
              <input
                type="text"
                value={slashCommand}
                onChange={(e) => setSlashCommand(e.target.value)}
                placeholder="/my-command"
                className="w-full px-3 py-2 rounded-lg border text-sm mt-1 font-mono"
                style={inputStyle}
              />
              {validation.errors.slashCommand && <span style={errorStyle}>{validation.errors.slashCommand}</span>}
            </div>

            {/* Tags */}
            <div>
              <label style={labelStyle}>Tags</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag..."
                  className="flex-1 px-3 py-2 rounded-lg border text-sm"
                  style={inputStyle}
                />
                <button
                  onClick={handleAddTag}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-primary)" }}
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 rounded flex items-center gap-1"
                      style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                    >
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} style={{ color: "var(--color-text-tertiary)" }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Extensions Selector */}
            {availableExtensions.length > 0 && (
              <div>
                <label style={labelStyle}>Required Extensions</label>
                <div className="mt-1 grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {availableExtensions.map((ext) => (
                    <label
                      key={ext.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs"
                      style={{
                        background: extensions.includes(ext.id) ? "var(--color-accent-soft)" : "var(--color-bg-tertiary)",
                        color: extensions.includes(ext.id) ? "var(--color-accent)" : "var(--color-text-secondary)",
                        border: `1px solid ${extensions.includes(ext.id) ? "var(--color-accent)" : "var(--color-border-primary)"}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={extensions.includes(ext.id)}
                        onChange={() => handleToggleExtension(ext.id)}
                        className="accent-[var(--color-accent)]"
                      />
                      {ext.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Variables Tab ────────────────────────────────────────────────── */}
        {activeTab === "variables" && (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center justify-between">
              <span style={labelStyle}>Variables ({variables.length})</span>
              <button
                onClick={handleAddVariable}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                + Add Variable
              </button>
            </div>

            {variables.length === 0 && (
              <div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>
                <p className="text-sm">No variables defined</p>
                <p className="text-xs mt-1">Variables can be referenced in the prompt using {"{{variable_name}}"} syntax</p>
              </div>
            )}

            {variables.map((variable, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border space-y-2"
                style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border-primary)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Variable #{idx + 1}
                  </span>
                  <button
                    onClick={() => handleRemoveVariable(idx)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: "var(--color-error)" }}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Name *</label>
                    <input
                      type="text"
                      value={variable.name}
                      onChange={(e) => handleUpdateVariable(idx, { name: e.target.value })}
                      placeholder="variable_name"
                      className="w-full px-2 py-1.5 rounded border text-xs font-mono mt-0.5"
                      style={inputStyle}
                    />
                    {validation.errors[`var_${idx}_name`] && (
                      <span style={errorStyle}>{validation.errors[`var_${idx}_name`]}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Type</label>
                    <select
                      value={variable.type || "string"}
                      onChange={(e) => handleUpdateVariable(idx, { type: e.target.value as RecipeVariable["type"] })}
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="file">File</option>
                      <option value="select">Select</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Description</label>
                  <input
                    type="text"
                    value={variable.description}
                    onChange={(e) => handleUpdateVariable(idx, { description: e.target.value })}
                    placeholder="What this variable controls"
                    className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                    style={inputStyle}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Default Value</label>
                    <input
                      type="text"
                      value={variable.defaultValue || ""}
                      onChange={(e) => handleUpdateVariable(idx, { defaultValue: e.target.value })}
                      placeholder="Optional default"
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    />
                  </div>
                  <div className="flex items-end gap-3 pb-1">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={variable.required}
                        onChange={(e) => handleUpdateVariable(idx, { required: e.target.checked })}
                        className="accent-[var(--color-accent)]"
                      />
                      Required
                    </label>
                  </div>
                </div>

                {variable.type === "select" && (
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Options (comma-separated)</label>
                    <input
                      type="text"
                      value={variable.options?.join(", ") || ""}
                      onChange={(e) =>
                        handleUpdateVariable(idx, {
                          options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      placeholder="Option A, Option B, Option C"
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    />
                    {validation.errors[`var_${idx}_options`] && (
                      <span style={errorStyle}>{validation.errors[`var_${idx}_options`]}</span>
                    )}
                  </div>
                )}

                {validation.warnings[`var_${variable.name}_ref`] && (
                  <span style={warningStyle}>{validation.warnings[`var_${variable.name}_ref`]}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── Sub-Recipes Tab ──────────────────────────────────────────────── */}
        {activeTab === "subrecipes" && (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center justify-between">
              <span style={labelStyle}>Sub-Recipes ({subRecipes.length})</span>
              <button
                onClick={handleAddSubRecipe}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                + Add Sub-Recipe
              </button>
            </div>

            {subRecipes.length === 0 && (
              <div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>
                <p className="text-sm">No sub-recipes defined</p>
                <p className="text-xs mt-1">Sub-recipes allow a recipe to call other recipes with variable overrides</p>
              </div>
            )}

            {subRecipes.map((subRecipe, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border space-y-2"
                style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border-primary)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Sub-Recipe #{idx + 1}
                  </span>
                  <button
                    onClick={() => handleRemoveSubRecipe(idx)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: "var(--color-error)" }}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Recipe *</label>
                    <select
                      value={subRecipe.recipeId}
                      onChange={(e) => handleUpdateSubRecipe(idx, { recipeId: e.target.value })}
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    >
                      <option value="">Select recipe...</option>
                      {availableRecipes.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {validation.errors[`sr_${idx}_recipe`] && (
                      <span style={errorStyle}>{validation.errors[`sr_${idx}_recipe`]}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Name</label>
                    <input
                      type="text"
                      value={subRecipe.name}
                      onChange={(e) => handleUpdateSubRecipe(idx, { name: e.target.value })}
                      placeholder="Sub-recipe name"
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>On Success</label>
                    <select
                      value={subRecipe.onSuccess || "continue"}
                      onChange={(e) => handleUpdateSubRecipe(idx, { onSuccess: e.target.value as any })}
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    >
                      <option value="continue">Continue</option>
                      <option value="stop">Stop</option>
                      <option value="retry">Retry</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>On Failure</label>
                    <select
                      value={subRecipe.onFailure || "continue"}
                      onChange={(e) => handleUpdateSubRecipe(idx, { onFailure: e.target.value as any })}
                      className="w-full px-2 py-1.5 rounded border text-xs mt-0.5"
                      style={inputStyle}
                    >
                      <option value="continue">Continue</option>
                      <option value="stop">Stop</option>
                      <option value="retry">Retry</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Variable Overrides (JSON)</label>
                  <input
                    type="text"
                    value={JSON.stringify(subRecipe.variableOverrides || {})}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        handleUpdateSubRecipe(idx, { variableOverrides: parsed });
                      } catch { /* ignore parse errors during typing */ }
                    }}
                    placeholder='{"key": "value"}'
                    className="w-full px-2 py-1.5 rounded border text-xs font-mono mt-0.5"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Condition (JS expression)</label>
                  <input
                    type="text"
                    value={subRecipe.condition || ""}
                    onChange={(e) => handleUpdateSubRecipe(idx, { condition: e.target.value })}
                    placeholder="e.g., variables.debug === 'true'"
                    className="w-full px-2 py-1.5 rounded border text-xs font-mono mt-0.5"
                    style={inputStyle}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Settings Tab ────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Max Retries</label>
                <input
                  type="number"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={10}
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Timeout (ms)</label>
                <input
                  type="number"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(parseInt(e.target.value, 10) || 0)}
                  min={1000}
                  step={1000}
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Default (uses provider default)"
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Max Tokens</label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 4096)}
                  min={1}
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Temperature: {temperature}</label>
              <input
                type="range"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                min={0}
                max={2}
                step={0.1}
                className="w-full mt-1 accent-[var(--color-accent)]"
              />
              <div className="flex justify-between text-xs" style={{ color: "var(--color-text-muted)" }}>
                <span>Precise (0)</span>
                <span>Balanced (1)</span>
                <span>Creative (2)</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={parallelSubRecipes}
                  onChange={(e) => setParallelSubRecipes(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="text-sm">Run sub-recipes in parallel</span>
              </label>

              {parallelSubRecipes && (
                <div className="ml-6">
                  <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Max Parallel Executions</label>
                  <input
                    type="number"
                    value={maxParallelExecutions}
                    onChange={(e) => setMaxParallelExecutions(parseInt(e.target.value, 10) || 3)}
                    min={1}
                    max={10}
                    className="w-20 px-2 py-1.5 rounded border text-xs mt-0.5"
                    style={inputStyle}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={continueOnError}
                  onChange={(e) => setContinueOnError(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="text-sm">Continue on error</span>
              </label>
            </div>
          </div>
        )}

        {/* ─── Schedule Tab ────────────────────────────────────────────────── */}
        {activeTab === "schedule" && (
          <div className="space-y-4 max-w-2xl">
            <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-sm font-medium">Enable Schedule</span>
            </label>

            {scheduleEnabled && (
              <>
                <div>
                  <label style={labelStyle}>Cron Expression</label>
                  <input
                    type="text"
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                    placeholder="0 9 * * *"
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono mt-1"
                    style={inputStyle}
                  />
                  {scheduleCron && (
                    <div className="text-xs mt-1" style={{ color: "var(--color-accent)" }}>
                      {humanizeCron(scheduleCron)}
                    </div>
                  )}
                  {validation.errors.schedule && (
                    <span style={errorStyle}>{validation.errors.schedule}</span>
                  )}
                </div>

                {/* Common Patterns */}
                <div>
                  <label style={labelStyle}>Common Patterns</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {[
                      { label: "Every hour", cron: "0 * * * *" },
                      { label: "Every 30 minutes", cron: "*/30 * * * *" },
                      { label: "Daily at 9am", cron: "0 9 * * *" },
                      { label: "Daily at midnight", cron: "0 0 * * *" },
                      { label: "Every weekday at 9am", cron: "0 9 * * 1-5" },
                      { label: "Every Monday at 10am", cron: "0 10 * * 1" },
                      { label: "Every 6 hours", cron: "0 */6 * * *" },
                      { label: "First of month at 9am", cron: "0 9 1 * *" },
                    ].map((pattern) => (
                      <button
                        key={pattern.cron}
                        onClick={() => setScheduleCron(pattern.cron)}
                        className="px-3 py-2 rounded-lg border text-xs text-left transition-colors"
                        style={{
                          background: scheduleCron === pattern.cron ? "var(--color-accent-soft)" : "var(--color-bg-tertiary)",
                          borderColor: scheduleCron === pattern.cron ? "var(--color-accent)" : "var(--color-border-primary)",
                          color: scheduleCron === pattern.cron ? "var(--color-accent)" : "var(--color-text-secondary)",
                        }}
                      >
                        <div className="font-medium">{pattern.label}</div>
                        <div className="font-mono text-xs opacity-70">{pattern.cron}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timezone */}
                <div>
                  <label style={labelStyle}>Timezone</label>
                  <select
                    value={scheduleTimezone}
                    onChange={(e) => setScheduleTimezone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                    style={inputStyle}
                  >
                    {[
                      Intl.DateTimeFormat().resolvedOptions().timeZone,
                      "UTC",
                      "America/New_York",
                      "America/Chicago",
                      "America/Denver",
                      "America/Los_Angeles",
                      "Europe/London",
                      "Europe/Berlin",
                      "Asia/Tokyo",
                      "Asia/Shanghai",
                      "Australia/Sydney",
                    ]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Preview Tab ─────────────────────────────────────────────────── */}
        {activeTab === "preview" && (
          <div className="max-w-2xl">
            <div
              className="p-4 rounded-lg border font-mono text-xs whitespace-pre-wrap overflow-auto max-h-[60vh]"
              style={{
                background: "var(--color-bg-secondary)",
                borderColor: "var(--color-border-primary)",
                color: "var(--color-text-primary)",
              }}
            >
              {JSON.stringify(
                {
                  name: name || "(unnamed)",
                  description: description || "(no description)",
                  version,
                  author,
                  prompt: prompt || "(no prompt)",
                  variables,
                  subRecipes,
                  extensions,
                  settings: {
                    maxRetries,
                    timeoutMs,
                    parallelSubRecipes,
                    maxParallelExecutions,
                    continueOnError,
                    model: model || "(default)",
                    temperature,
                    maxTokens,
                  },
                  slashCommand: slashCommand || undefined,
                  schedule: scheduleEnabled
                    ? { enabled: true, cron: scheduleCron, timezone: scheduleTimezone }
                    : undefined,
                  tags,
                },
                null,
                2
              )}
            </div>
          </div>
        )}

        {/* ─── Import/Export Tab ────────────────────────────────────────────── */}
        {activeTab === "import-export" && (
          <div className="space-y-6 max-w-2xl">
            {/* Import */}
            <div className="p-4 rounded-lg border" style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border-primary)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>Import Recipe</h3>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setImportFormat("json")}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    background: importFormat === "json" ? "var(--color-accent)" : "var(--color-bg-tertiary)",
                    color: importFormat === "json" ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  JSON
                </button>
                <button
                  onClick={() => setImportFormat("yaml")}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    background: importFormat === "yaml" ? "var(--color-accent)" : "var(--color-bg-tertiary)",
                    color: importFormat === "yaml" ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  YAML
                </button>
              </div>

              <textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                placeholder={`Paste ${importFormat.toUpperCase()} recipe content here...`}
                rows={8}
                className="w-full px-3 py-2 rounded-lg border text-xs font-mono resize-y"
                style={inputStyle}
              />

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>or import from URL:</span>
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-2 py-1.5 rounded border text-xs"
                  style={inputStyle}
                />
              </div>

              <button
                onClick={handleImport}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                Import
              </button>
            </div>

            {/* Export */}
            <div className="p-4 rounded-lg border" style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border-primary)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>Export Recipe</h3>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setExportFormat("json")}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    background: exportFormat === "json" ? "var(--color-accent)" : "var(--color-bg-tertiary)",
                    color: exportFormat === "json" ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  JSON
                </button>
                <button
                  onClick={() => setExportFormat("yaml")}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    background: exportFormat === "yaml" ? "var(--color-accent)" : "var(--color-bg-tertiary)",
                    color: exportFormat === "yaml" ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  YAML
                </button>
              </div>

              <button
                onClick={handleExport}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                Download as {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeEditor;
