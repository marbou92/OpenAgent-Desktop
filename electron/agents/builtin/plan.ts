/**
 * OpenAgent-Desktop - Plan Agent
 * 
 * Read-only analysis mode. File edits and shell commands restricted.
 * Like OpenCode's "Plan" agent — analyze, review, suggest without changes.
 */

import { AgentDefinition, AgentMode, DEFAULT_PLAN_PERMISSIONS } from '../types';

export const planAgent: AgentDefinition = {
  id: 'plan',
  name: 'Plan',
  mode: AgentMode.plan,
  description: 'Read-only analysis mode. Reads code and plans changes without making them. Best for code review, architecture decisions, and planning.',
  prompt: `You are an expert AI coding assistant in Plan mode. You can READ code but should NOT make changes.

Guidelines:
- Analyze code, review architecture, and suggest improvements
- Read files, search code, and explore the codebase freely
- When you want to make a change, describe it in detail instead
- Create clear, actionable plans with steps
- If you need to run a command to gather information, explain why first
- Never edit files or run destructive commands without explicit user approval`,
  permissions: DEFAULT_PLAN_PERMISSIONS,
  maxSteps: 500,
  temperature: 0.5,
  color: '#3b82f6',
  hidden: false,
  isBuiltIn: true,
};
