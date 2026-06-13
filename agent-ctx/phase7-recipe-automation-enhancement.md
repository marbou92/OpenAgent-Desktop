# Phase 7 - Recipe & Automation System Enhancements

## Task Summary
Created 6 new files enhancing the Recipe & Automation system for OpenAgent-Desktop.

## Files Created

### Backend (electron/recipes/)

1. **recipe-importer.ts** - Recipe YAML/JSON Import-Export
   - `RecipeFormat` type: 'json' | 'yaml' | 'url'
   - `ImportResult` interface with success, recipe, recipes, errors, warnings
   - `RecipeImporter` class with:
     - `importFromString()` - Parse YAML/JSON content
     - `importFromFile()` - Read and import from file path
     - `importFromUrl()` - Fetch and import from URL (GitHub raw, gist)
     - `exportToString()` - Serialize recipe to YAML/JSON
     - `exportToFile()` - Write recipe to disk
     - `validate()` - Full schema validation (required fields, types, variables, settings, schedule)
     - `convertFormat()` - Convert between JSON and YAML
   - Backward compatibility: auto-migrate V0 (title/body/args) and V1 (snake_case settings) formats
   - Recipe collections: multiple recipes in one file (array input)
   - Auto-format detection from content and URL extensions

2. **scheduled-executor.ts** - Scheduled Recipe Execution
   - `ScheduleType`: 'one_time' | 'recurring'
   - `JobStatus`: 'active' | 'paused' | 'error' | 'completed'
   - `OnErrorPolicy`: 'continue' | 'pause' | 'notify'
   - `ScheduledJob` interface with full job lifecycle tracking
   - `JobRunLog` for execution history
   - `ScheduledExecutor` class (extends EventEmitter):
     - `schedule()` - Create recurring or one-time job
     - `pause()` / `resume()` / `cancel()` - Job lifecycle
     - `runNow()` - Immediate execution
     - `listJobs()` / `getJob()` / `getUpcoming()` - Query methods
     - `getRunLogs()` - Execution history
   - Cron expression parsing (5-field format with intervals)
   - Next run calculation with forward search algorithm
   - Error handling with max retries and configurable on-error policy
   - Persistence to `~/.openagent/scheduled-jobs.json`
   - Timer-based scheduling with 30-second check interval
   - Timezone support
   - Events: job:started, job:completed, job:failed, job:scheduled, job:cancelled

3. **subagent-dashboard.ts** - Subagent Monitoring Dashboard (Backend)
   - `SubagentProgress` - Step tracking, percentage, current activity
   - `SubagentResourceUsage` - Tokens, tool calls, files accessed
   - `SubagentStatus` - Full task status with progress and resources
   - `SubagentMessage` - Parent-child communication with direction and type
   - `AggregateResourceUsage` - Session-wide totals and averages
   - `ConcurrencyLane` - Parallel execution visualization data
   - `SubagentDashboard` class (extends EventEmitter):
     - `registerTask()` - Register for monitoring
     - `updateProgress()` / `updateStatus()` / `updateResourceUsage()` - Live updates
     - `addMessage()` - Parent-child messaging
     - `getDashboard()` - Complete dashboard data
     - `getSessionTasks()` / `getActiveTasks()` - Filtered queries
     - `getAggregateResourceUsage()` - Per-session or global aggregates
     - `getConcurrencyLanes()` - Parallel execution lane assignment
     - `cancelTask()` / `sendToChild()` / `clearCompleted()` - Control methods
   - Events: task:progress, task:status, task:message

### Frontend (src/components/Recipes/)

4. **RecipeEditor.tsx** - Recipe Editor Component
   - Multi-tab interface: Edit, Variables, Sub-Recipes, Settings, Schedule, Preview, Import/Export
   - Edit tab: name, description, version, author, prompt (multi-line), slash command, tags, extension selector
   - Variables tab: add/remove variables with name, type, default, required, options (for select type)
   - Sub-Recipes tab: add/remove sub-recipe refs with recipe selector, variable overrides, conditions, success/failure policies
   - Settings tab: max retries, timeout, model, temperature (slider), max tokens, parallel execution, continue on error
   - Schedule tab: enable/disable, cron expression with human-readable preview, common patterns picker, timezone selector
   - Preview tab: JSON rendering of complete recipe
   - Import/Export tab: paste JSON/YAML, URL import, download as JSON/YAML
   - Real-time validation with error/warning indicators
   - Dark theme with CSS variable theming

5. **ScheduledJobsView.tsx** - Scheduled Jobs UI
   - Upcoming runs section with live countdown timers
   - Job list with status badges (active/paused/error/completed)
   - Per-job actions: Run Now, Pause/Resume, Cancel, Retry
   - Expandable run history per job
   - Create job form: recipe selector, schedule type (recurring/one-time), cron patterns, timezone
   - Variable overrides for scheduled jobs
   - Dark theme

6. **SubagentDashboardView.tsx** - Subagent Monitoring UI
   - Aggregate stats grid: total tasks, running, completed, failed, tokens, avg duration
   - Concurrency visualization: parallel execution lanes
   - Active subagents panel with progress bars and resource usage
   - Task history with status filter (all/active/completed/error)
   - Selected task detail: prompt, error, resource usage, file access
   - Parent-child message log with direction indicators
   - Send message to running subagent
   - Auto-refresh toggle
   - Dark theme

## Verification
- Electron files compile cleanly with `tsconfig.electron.json` (no errors in new files)
- Frontend files compile cleanly with `tsconfig.json` (no errors in new files)
- Pre-existing error in `src/hooks/useChat.ts` (unrelated to Phase 7)
- All files follow existing project patterns: CSS variable theming, TypeScript types, EventEmitter pattern
